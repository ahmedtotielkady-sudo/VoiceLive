(function () {
  'use strict';

  const API = window.location.origin;
  let socket = null;
  let activeRoomId = null;
  let originalJoinRoom = null;
  let originalLeaveRoom = null;
  let originalRenderRooms = null;
  let originalTakeSeat = null;
  let originalSendChatMessage = null;

  function sessionData() {
    try {
      return JSON.parse(localStorage.getItem('voicelive_session') || 'null');
    } catch (_) {
      return null;
    }
  }

  function toast(message, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type || 'info');
    } else {
      console.log(message);
    }
  }

  function connect() {
    const session = sessionData();
    if (!session || !session.token || typeof window.io !== 'function') return;

    if (socket && socket.connected) return;
    if (socket) socket.disconnect();

    socket = window.io(API, {
      auth: { token: session.token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10
    });

    socket.on('connect', function () {
      console.log('VoiceLive realtime connected');
      loadRooms();
      if (activeRoomId) {
        socket.emit('room:join', { roomCode: activeRoomId }, handleRoomJoin);
      }
    });

    socket.on('connect_error', function (err) {
      console.error('Realtime connection failed:', err.message);
    });

    socket.on('rooms:list', function (rooms) {
      if (!Array.isArray(rooms)) return;
      window.state.rooms = rooms;
      if (typeof window.renderRooms === 'function') window.renderRooms();
    });

    socket.on('chat:new', appendMessage);

    socket.on('seats:updated', function (seats) {
      if (!Array.isArray(seats)) return;
      window.state.seats = seats.map(function (seat, index) {
        return {
          seatNum: seat.seatNum || index + 1,
          user: seat.username || seat.user || null,
          userId: seat.userId || null,
          avatar: seat.avatar || window.state.user.avatar,
          isSpeaking: Boolean(seat.isSpeaking)
        };
      });
      if (typeof window.renderSeats === 'function') window.renderSeats();
    });

    socket.on('room:presence', function (data) {
      if (!data) return;
      const room = window.state.rooms.find(function (r) {
        return String(r.id || r.roomCode) === String(data.roomCode);
      });
      if (room) {
        room.online = data.online;
        if (typeof window.renderRooms === 'function') window.renderRooms();
      }
    });
  }

  function loadRooms() {
    if (!socket || !socket.connected) return;
    socket.emit('rooms:get', function (result) {
      if (result && result.ok && Array.isArray(result.rooms)) {
        window.state.rooms = result.rooms;
        if (typeof window.renderRooms === 'function') window.renderRooms();
      }
    });
  }

  function handleRoomJoin(result) {
    if (!result || !result.ok) {
      toast((result && result.error) || 'تعذر دخول الغرفة', 'error');
      return;
    }

    if (result.room && Array.isArray(result.room.seats)) {
      window.state.seats = result.room.seats.map(function (seat, index) {
        return {
          seatNum: seat.seatNum || index + 1,
          user: seat.username || seat.user || null,
          userId: seat.userId || null,
          avatar: seat.avatar || window.state.user.avatar,
          isSpeaking: Boolean(seat.isSpeaking)
        };
      });
      if (typeof window.renderSeats === 'function') window.renderSeats();
    }

    const messages = document.getElementById('room-messages');
    if (messages) {
      messages.replaceChildren();
      (result.messages || []).forEach(appendMessage);
    }
  }

  function appendMessage(message) {
    const container = document.getElementById('room-messages');
    if (!container || !message) return;

    const row = document.createElement('div');
    row.className = 'bg-transparent border-0 p-2 rounded-xl';

    const name = document.createElement('span');
    name.className = 'font-bold text-white ml-1';
    name.textContent = String(message.username || 'مستخدم') + ':';

    const body = document.createElement('span');
    body.className = 'text-white';
    body.textContent = String(message.text || '');

    row.append(name, body);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
  }

  function install() {
    if (!window.state) return;

    originalJoinRoom = window.joinRoom;
    originalLeaveRoom = window.leaveRoom;
    originalRenderRooms = window.renderRooms;
    originalTakeSeat = window.takeSeat;
    originalSendChatMessage = window.sendChatMessage;

    window.joinRoom = function (room) {
      if (!socket || !socket.connected) {
        connect();
        toast('سجّل الدخول وتأكد من اتصال الخادم أولًا', 'error');
        return;
      }

      const roomCode = room.roomCode || room.id;
      socket.emit('room:join', { roomCode: String(roomCode) }, function (result) {
        if (!result || !result.ok) {
          toast((result && result.error) || 'تعذر دخول الغرفة', 'error');
          return;
        }
        activeRoomId = String(roomCode);
        window.state.currentRoom = room;
        if (originalJoinRoom) originalJoinRoom(room);
        handleRoomJoin(result);
      });
    };

    window.leaveRoom = function () {
      if (socket && socket.connected) socket.emit('room:leave');
      activeRoomId = null;
      if (originalLeaveRoom) originalLeaveRoom();
    };

    window.takeSeat = function (seatIndex) {
      if (!socket || !socket.connected || !activeRoomId) {
        toast('ادخل غرفة أولًا', 'error');
        return;
      }

      const seat = window.state.seats[seatIndex];
      if (seat && seat.user === window.state.user.name) {
        socket.emit('seat:leave', function (result) {
          if (result && result.ok) toast('تركت المايك');
          else toast((result && result.error) || 'تعذر ترك المقعد', 'error');
        });
      } else {
        socket.emit('seat:take', { seatNum: seatIndex + 1 }, function (result) {
          if (result && result.ok) toast('تم حجز المقعد');
          else toast((result && result.error) || 'المقعد غير متاح', 'error');
        });
      }
    };

    window.sendChatMessage = function () {
      const input = document.getElementById('room-chat-input');
      const text = input ? input.value.trim() : '';
      if (!text) return;

      if (!socket || !socket.connected || !activeRoomId) {
        toast('اتصل بالخادم وادخل غرفة أولًا', 'error');
        return;
      }

      socket.emit('chat:send', { text: text }, function (result) {
        if (result && result.ok) {
          input.value = '';
        } else {
          toast((result && result.error) || 'تعذر إرسال الرسالة', 'error');
        }
      });
    };

    connect();
  }

  window.addEventListener('voicelive:session-ready', connect);

  window.addEventListener('DOMContentLoaded', function () {
    install();
    connect();
  });

  // يتيح إعادة الاتصال بعد تسجيل الدخول دون إعادة تحميل الصفحة.
  window.connectVoiceLiveRealtime = connect;
})();
