const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const Room = mongoose.models.VoiceRoom || mongoose.model(
  'VoiceRoom',
  new mongoose.Schema({
    roomCode: { type: String, unique: true, required: true, index: true },
    title: { type: String, required: true, maxlength: 80 },
    tag: { type: String, default: 'عام', maxlength: 30 },
    hostId: { type: mongoose.Schema.Types.ObjectId, required: true },
    host: { type: String, required: true },
    micCount: { type: Number, min: 1, max: 30, default: 8 },
    micManagers: [{
      userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      username: { type: String, required: true }
    }],
    seats: {
      type: [{
        seatNum: Number,
        userId: { type: mongoose.Schema.Types.ObjectId, default: null },
        username: { type: String, default: null },
        avatar: { type: String, default: null },
        isSpeaking: { type: Boolean, default: false }
      }],
      default: () => Array.from({ length: 8 }, (_, i) => ({
        seatNum: i + 1,
        userId: null,
        username: null,
        avatar: null,
        isSpeaking: false
      }))
    },
    createdAt: { type: Date, default: Date.now }
  })
);

const Message = mongoose.models.VoiceMessage || mongoose.model(
  'VoiceMessage',
  new mongoose.Schema({
    roomCode: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    username: { type: String, required: true },
    text: { type: String, required: true, maxlength: 500 },
    createdAt: { type: Date, default: Date.now }
  })
);

function safeRoom(room, online = 0, userId = null) {
  const isOwner = !!userId && String(room.hostId) === String(userId);
  const canManageMics = isOwner || (
    !!userId && (room.micManagers || []).some(
      m => String(m.userId) === String(userId)
    )
  );
  return {
    id: room.roomCode,
    roomCode: room.roomCode,
    title: room.title,
    host: room.host,
    tag: room.tag,
    online,
    micCount: Math.max(1, Math.min(30, Number(room.micCount || room.seats.length || 8))),
    isOwner,
    canManageMics,
    seats: room.seats
  };
}

function normalizeSeats(room) {
  const count = Math.max(1, Math.min(30, Number(room.micCount || room.seats.length || 8)));
  const existing = new Map((room.seats || []).map(seat => [Number(seat.seatNum), seat]));
  const seats = [];
  for (let n = 1; n <= count; n++) {
    seats.push(existing.get(n) || {
      seatNum: n, userId: null, username: null, avatar: null, isSpeaking: false
    });
  }
  room.seats = seats;
  room.micCount = count;
  return room;
}

function attachRealtime(httpServer, app, User) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',').map(x => x.trim())
        : ['https://localhost', 'http://localhost', 'capacitor://localhost'],
      methods: ['GET', 'POST']
    }
  });

  const onlineSockets = new Map();

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token || !process.env.JWT_SECRET) {
        return next(new Error('Authentication required'));
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.sub).select('_id username coins');

      if (!user) return next(new Error('User not found'));

      socket.data.user = {
        id: user._id,
        username: user.username
      };
      next();
    } catch (_) {
      next(new Error('Invalid or expired session'));
    }
  });

  function countRoom(roomCode) {
    return io.sockets.adapter.rooms.get(roomCode)?.size || 0;
  }

  async function emitRoomList() {
    try {
      const rooms = await Room.find().sort({ createdAt: -1 }).limit(100).lean();
      io.emit('rooms:list', rooms.map(r => ({
        id: r.roomCode,
        roomCode: r.roomCode,
        title: r.title,
        host: r.host,
        tag: r.tag,
        online: countRoom(r.roomCode)
      })));
    } catch (err) {
      console.error('Room list error:', err.message);
    }
  }

  async function releaseSeat(roomCode, userId) {
    if (!roomCode) return;
    const room = await Room.findOne({ roomCode });
    if (!room) return;

    let changed = false;
    for (const seat of room.seats) {
      if (seat.userId && String(seat.userId) === String(userId)) {
        seat.userId = null;
        seat.username = null;
        seat.avatar = null;
        seat.isSpeaking = false;
        changed = true;
      }
    }

    if (changed) {
      await room.save();
      io.to(roomCode).emit('seats:updated', room.seats);
    }
  }

  io.on('connection', socket => {
    const user = socket.data.user;
    const previous = onlineSockets.get(String(user.id)) || new Set();
    previous.add(socket.id);
    onlineSockets.set(String(user.id), previous);

    socket.on('rooms:get', async (ack) => {
      try {
        const rooms = await Room.find().sort({ createdAt: -1 }).limit(100).lean();
        const result = rooms.map(r => ({
          id: r.roomCode,
          roomCode: r.roomCode,
          title: r.title,
          host: r.host,
          tag: r.tag,
          online: countRoom(r.roomCode)
        }));
        if (typeof ack === 'function') ack({ ok: true, rooms: result });
        socket.emit('rooms:list', result);
      } catch (_) {
        if (typeof ack === 'function') ack({ ok: false, error: 'تعذر تحميل الغرف' });
      }
    });

    socket.on('room:create', async (data = {}, ack) => {
      try {
        const title = String(data.title || '').trim().slice(0, 80);
        const tag = String(data.tag || 'عام').trim().slice(0, 30) || 'عام';

        if (title.length < 2) {
          if (typeof ack === 'function') ack({ ok: false, error: 'اسم الغرفة قصير جدًا' });
          return;
        }

        const roomCode = String(Date.now()).slice(-8) +
          String(Math.floor(Math.random() * 90 + 10));

        const room = await Room.create({
          roomCode,
          title,
          tag,
          hostId: user.id,
          host: user.username
        });

        if (typeof ack === 'function') ack({ ok: true, room: safeRoom(room, 0, user.id) });
        await emitRoomList();
      } catch (err) {
        console.error('Room create error:', err.message);
        if (typeof ack === 'function') ack({ ok: false, error: 'تعذر إنشاء الغرفة' });
      }
    });

    socket.on('room:join', async (data = {}, ack) => {
      try {
        const roomCode = String(data.roomCode || '');
        const room = await Room.findOne({ roomCode });
        if (!room) {
          if (typeof ack === 'function') ack({ ok: false, error: 'الغرفة غير موجودة' });
          return;
        }
        normalizeSeats(room);

        if (socket.data.roomCode && socket.data.roomCode !== roomCode) {
          const oldCode = socket.data.roomCode;
          await releaseSeat(oldCode, user.id);
          socket.leave(oldCode);
        }

        socket.join(roomCode);
        socket.data.roomCode = roomCode;

        const messages = await Message.find({ roomCode })
          .sort({ createdAt: -1 }).limit(50).lean();

        const result = {
          ok: true,
          room: safeRoom(room, countRoom(roomCode), user.id),
          messages: messages.reverse().map(m => ({
            username: m.username,
            text: m.text,
            createdAt: m.createdAt
          }))
        };

        if (typeof ack === 'function') ack(result);
        io.to(roomCode).emit('room:presence', { roomCode, online: countRoom(roomCode) });
        await emitRoomList();
      } catch (err) {
        console.error('Room join error:', err.message);
        if (typeof ack === 'function') ack({ ok: false, error: 'تعذر دخول الغرفة' });
      }
    });

    socket.on('room:leave', async (ack) => {
      try {
        const roomCode = socket.data.roomCode;
        if (roomCode) {
          await releaseSeat(roomCode, user.id);
          socket.leave(roomCode);
          delete socket.data.roomCode;
          io.to(roomCode).emit('room:presence', { roomCode, online: countRoom(roomCode) });
          await emitRoomList();
        }
        if (typeof ack === 'function') ack({ ok: true });
      } catch (_) {
        if (typeof ack === 'function') ack({ ok: false, error: 'تعذر الخروج من الغرفة' });
      }
    });

    socket.on('chat:send', async (data = {}, ack) => {
      try {
        const roomCode = socket.data.roomCode;
        const text = String(data.text || '').trim();

        if (!roomCode || !text || text.length > 500) {
          if (typeof ack === 'function') ack({ ok: false, error: 'رسالة غير صالحة' });
          return;
        }

        const message = await Message.create({
          roomCode,
          userId: user.id,
          username: user.username,
          text
        });

        const result = {
          username: message.username,
          text: message.text,
          createdAt: message.createdAt
        };

        io.to(roomCode).emit('chat:new', result);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        console.error('Chat save error:', err.message);
        if (typeof ack === 'function') ack({ ok: false, error: 'تعذر إرسال الرسالة' });
      }
    });

    socket.on('room:mics:set', async (data = {}, ack) => {
      try {
        const roomCode = socket.data.roomCode;
        const requested = Number(data.micCount);
        if (!roomCode || !Number.isInteger(requested) || requested < 1 || requested > 30) {
          if (typeof ack === 'function') ack({ ok: false, error: 'اختر عددًا من 1 إلى 30' });
          return;
        }

        const room = await Room.findOne({ roomCode });
        if (!room) {
          if (typeof ack === 'function') ack({ ok: false, error: 'الغرفة غير موجودة' });
          return;
        }

        const allowed = String(room.hostId) === String(user.id) ||
          (room.micManagers || []).some(m => String(m.userId) === String(user.id));
        if (!allowed) {
          if (typeof ack === 'function') ack({ ok: false, error: 'ليس لديك صلاحية إدارة المايكات' });
          return;
        }

        normalizeSeats(room);
        if (requested < room.micCount &&
            room.seats.some(seat => Number(seat.seatNum) > requested && seat.userId)) {
          if (typeof ack === 'function') ack({
            ok: false,
            error: 'لا يمكن تقليل العدد لأن هناك مقاعد مشغولة بعد العدد الجديد'
          });
          return;
        }

        const oldSeats = new Map(room.seats.map(seat => [Number(seat.seatNum), seat]));
        room.seats = Array.from({ length: requested }, (_, i) => oldSeats.get(i + 1) || ({
          seatNum: i + 1, userId: null, username: null, avatar: null, isSpeaking: false
        }));
        room.micCount = requested;
        await room.save();

        io.to(roomCode).emit('seats:updated', room.seats);
        io.to(roomCode).emit('mics:updated', {
          roomCode, micCount: requested, seats: room.seats
        });
        if (typeof ack === 'function') ack({
          ok: true, micCount: requested, seats: room.seats
        });
      } catch (err) {
        console.error('Mic count update error:', err.message);
        if (typeof ack === 'function') ack({ ok: false, error: 'تعذر تعديل عدد المايكات' });
      }
    });

    socket.on('room:mic-permission:set', async (data = {}, ack) => {
      try {
        const roomCode = socket.data.roomCode;
        const username = String(data.username || '').trim();
        const enabled = data.enabled === true;

        if (!roomCode || !username || username.length > 24) {
          if (typeof ack === 'function') ack({ ok: false, error: 'اسم المستخدم غير صالح' });
          return;
        }

        const room = await Room.findOne({ roomCode });
        if (!room) {
          if (typeof ack === 'function') ack({ ok: false, error: 'الغرفة غير موجودة' });
          return;
        }

        if (String(room.hostId) !== String(user.id)) {
          if (typeof ack === 'function') ack({ ok: false, error: 'مالك الغرفة فقط يمنح هذه الصلاحية' });
          return;
        }

        const target = await User.findOne({ username }).select('_id username');
        if (!target) {
          if (typeof ack === 'function') ack({ ok: false, error: 'لم يتم العثور على المستخدم' });
          return;
        }
        if (String(target._id) === String(room.hostId)) {
          if (typeof ack === 'function') ack({ ok: false, error: 'المالك لديه الصلاحية بالفعل' });
          return;
        }

        room.micManagers = room.micManagers || [];
        const exists = room.micManagers.some(m => String(m.userId) === String(target._id));
        if (enabled && !exists) {
          room.micManagers.push({ userId: target._id, username: target.username });
        } else if (!enabled && exists) {
          room.micManagers = room.micManagers.filter(m => String(m.userId) !== String(target._id));
        }
        await room.save();

        if (typeof ack === 'function') ack({
          ok: true,
          enabled,
          username: target.username,
          micManagers: room.micManagers.map(m => ({
            userId: String(m.userId), username: m.username
          }))
        });
      } catch (err) {
        console.error('Mic permission update error:', err.message);
        if (typeof ack === 'function') ack({ ok: false, error: 'تعذر تعديل الصلاحية' });
      }
    });

    socket.on('seat:take', async (data = {}, ack) => {
      try {
        const roomCode = socket.data.roomCode;
        const seatNum = Number(data.seatNum);

        if (!roomCode || !Number.isInteger(seatNum) || seatNum < 1 || seatNum > 30) {
          if (typeof ack === 'function') ack({ ok: false, error: 'رقم المقعد غير صالح' });
          return;
        }

        const room = await Room.findOne({ roomCode });
        if (!room) {
          if (typeof ack === 'function') ack({ ok: false, error: 'الغرفة غير موجودة' });
          return;
        }

        normalizeSeats(room);
        if (seatNum > room.micCount) {
          if (typeof ack === 'function') ack({ ok: false, error: 'هذا المقعد غير متاح في الغرفة' });
          return;
        }
        const target = room.seats.find(s => s.seatNum === seatNum);
        if (!target) {
          if (typeof ack === 'function') ack({ ok: false, error: 'المقعد غير موجود' });
          return;
        }

        if (target.userId && String(target.userId) !== String(user.id)) {
          if (typeof ack === 'function') ack({ ok: false, error: 'المقعد محجوز بالفعل' });
          return;
        }

        for (const seat of room.seats) {
          if (seat.userId && String(seat.userId) === String(user.id)) {
            seat.userId = null;
            seat.username = null;
            seat.avatar = null;
            seat.isSpeaking = false;
          }
        }

        target.userId = user.id;
        target.username = user.username;
        target.avatar = null;
        target.isSpeaking = false;

        await room.save();
        io.to(roomCode).emit('seats:updated', room.seats);
        if (typeof ack === 'function') ack({ ok: true, seats: room.seats });
      } catch (err) {
        console.error('Seat update error:', err.message);
        if (typeof ack === 'function') ack({ ok: false, error: 'تعذر حجز المقعد' });
      }
    });

    socket.on('seat:leave', async (ack) => {
      try {
        await releaseSeat(socket.data.roomCode, user.id);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (_) {
        if (typeof ack === 'function') ack({ ok: false, error: 'تعذر ترك المقعد' });
      }
    });

    socket.on('disconnect', async () => {
      try {
        const roomCode = socket.data.roomCode;
        await releaseSeat(roomCode, user.id);

        const sockets = onlineSockets.get(String(user.id));
        if (sockets) {
          sockets.delete(socket.id);
          if (!sockets.size) onlineSockets.delete(String(user.id));
        }

        if (roomCode) {
          io.to(roomCode).emit('room:presence', { roomCode, online: countRoom(roomCode) });
        }
        await emitRoomList();
      } catch (err) {
        console.error('Disconnect cleanup error:', err.message);
      }
    });

    emitRoomList();
  });

  app.get('/api/rooms', async (_req, res) => {
    try {
      const rooms = await Room.find().sort({ createdAt: -1 }).limit(100).lean();
      res.json(rooms.map(r => ({
        id: r.roomCode,
        roomCode: r.roomCode,
        title: r.title,
        host: r.host,
        tag: r.tag,
        online: countRoom(r.roomCode)
      })));
    } catch (_) {
      res.status(500).json({ error: 'تعذر تحميل الغرف' });
    }
  });

  return io;
}

module.exports = { attachRealtime };
