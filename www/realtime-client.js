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

    socket.on('mics:updated', function (data) {
      if (!data || String(data.roomCode) !== String(activeRoomId)) return;

      if (window.state.currentRoom) {
        window.state.currentRoom.micCount = Number(data.micCount) || 8;
      }

      if (Array.isArray(data.seats)) {
        window.state.seats = data.seats.map(function (seat, index) {
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

      updateMicControls();
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

    if (result.room) {
      window.state.currentRoom = Object.assign(
        {}, window.state.currentRoom || {}, result.room
      );
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

    updateMicControls();
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

  function updateMicControls() {
    const panel = document.getElementById('room-mic-controls');
    const permissionPanel = document.getElementById('room-mic-permission-controls');
    const selector = document.getElementById('room-mic-count');
    const managers = document.getElementById('room-mic-managers');
    const room = window.state && window.state.currentRoom;

    const canManage = !!room && (room.isOwner === true || room.canManageMics === true);
    const isOwner = !!room && room.isOwner === true;

    if (panel) panel.classList.toggle('hidden', !canManage);
    if (permissionPanel) permissionPanel.classList.toggle('hidden', !isOwner);

    if (selector) {
      if (!selector.options.length) {
        for (let n = 1; n <= 30; n++) {
          const option = document.createElement('option');
          option.value = String(n);
          option.textContent = n + (n === 1 ? ' مايك' : ' مايكات');
          selector.appendChild(option);
        }
      }
      selector.value = String(Math.max(1, Math.min(30,
        Number(room && room.micCount) || 8
      )));
    }

    if (managers && !isOwner) managers.replaceChildren();
  }

  window.applyRoomMicCount = function () {
    const selector = document.getElementById('room-mic-count');
    const room = window.state && window.state.currentRoom;
    const count = Number(selector && selector.value);

    if (!room || !(room.isOwner || room.canManageMics)) {
      toast('ليس لديك صلاحية إدارة المايكات', 'error');
      return;
    }
    if (!socket || !socket.connected || !activeRoomId) {
      toast('اتصل بالخادم أولًا', 'error');
      return;
    }

    socket.emit('room:mics:set', { micCount: count }, function (result) {
      if (!result || !result.ok) {
        toast((result && result.error) || 'تعذر تعديل عدد المايكات', 'error');
        updateMicControls();
        return;
      }

      room.micCount = result.micCount;
      if (Array.isArray(result.seats)) {
        window.state.seats = result.seats.map(function (seat, index) {
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
      updateMicControls();
      toast('تم تحديث عدد المايكات إلى ' + result.micCount);
    });
  };

  window.setRoomMicPermission = function (enabled) {
    const room = window.state && window.state.currentRoom;
    const input = document.getElementById('room-mic-manager-username');
    const username = input ? input.value.trim() : '';

    if (!room || room.isOwner !== true) {
      toast('مالك الغرفة فقط يمكنه إدارة الصلاحيات', 'error');
      return;
    }
    if (!username || username.length > 24) {
      toast('اكتب اسم المستخدم الصحيح', 'error');
      return;
    }
    if (!socket || !socket.connected || !activeRoomId) {
      toast('اتصل بالخادم أولًا', 'error');
      return;
    }

    socket.emit('room:mic-permission:set', {
      username: username,
      enabled: enabled === true
    }, function (result) {
      if (!result || !result.ok) {
        toast((result && result.error) || 'تعذر تحديث الصلاحية', 'error');
        return;
      }

      const list = document.getElementById('room-mic-managers');
      if (list) {
        list.replaceChildren();
        (result.micManagers || []).forEach(function (manager) {
          const item = document.createElement('div');
          item.className = 'text-xs text-violet-200 py-1';
          item.textContent = manager.username || '';
          list.appendChild(item);
        });
      }

      toast(enabled ? 'تم منح صلاحية إدارة المايكات' : 'تم سحب صلاحية إدارة المايكات');
    });
  };

  window.grantRoomMicPermission = function () {
    window.setRoomMicPermission(true);
  };

  window.revokeRoomMicPermission = function () {
    window.setRoomMicPermission(false);
  };

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
      updateMicControls();
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
  window.updateVoiceLiveMicControls = updateMicControls;
})();
