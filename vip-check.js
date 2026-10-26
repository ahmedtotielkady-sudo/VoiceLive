

        /* حالة التطبيق الموحدة (State Management) */
        let state = {
            user: {
                id: '88492',
                name: 'أمير الليل',
                avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
                coins: 1500,
                role: 'user' // الدور الافتراضي الآمن
            },
            currentRoom: null,
            isMicMuted: false,
            rooms: [
                { id: 101, title: '👑 سهرة طرب وروقان الخليج', host: 'سلطان زمانه', online: 342, tag: 'طرب' },
                { id: 102, title: '🔥 تحديات الصراحة والشعر', host: 'ريما', online: 189, tag: 'شعر' },
                { id: 103, title: '🎮 مسابقة أسئلة وجوائز عملات', host: 'فهد VIP', online: 512, tag: 'ألعاب' }
            ],
            // 8 مقاعد للمايكات في الغرفة الصوتية
            seats: [
                { seatNum: 1, user: 'سلطان زمانه', isSpeaking: true, avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=100&q=80' },
                { seatNum: 2, user: null },
                { seatNum: 3, user: null },
                { seatNum: 4, user: null },
                { seatNum: 5, user: null },
                { seatNum: 6, user: null },
                { seatNum: 7, user: null },
                { seatNum: 8, user: null }
            ]
        };

        // تشغيل التهيئة عند بدء تحميل الصفحة
        window.addEventListener('DOMContentLoaded', () => {
            loadPrivacySettings();
            renderRooms();
            renderSeats();
            updateUIState();
        });

        /* التنبيهات المنبثقة الراقية (Toast) */

        function loadPrivacySettings() {
            let settings = {};
            try {
                settings = JSON.parse(localStorage.getItem('voicelive_privacy') || '{}');
            } catch (_) {}
            const language = document.getElementById('privacy-language');
            const avatar = document.getElementById('privacy-avatar');
            const name = document.getElementById('privacy-name');
            const userId = document.getElementById('privacy-user-id');
            if (language) language.value = settings.language || 'ar';
            if (avatar) avatar.checked = settings.showAvatar !== false;
            if (name) name.checked = settings.showName !== false;
            if (userId && state && state.user) userId.textContent = state.user.id;
        }

        function savePrivacySettings() {
            const settings = {
                language: document.getElementById('privacy-language').value,
                showAvatar: document.getElementById('privacy-avatar').checked,
                showName: document.getElementById('privacy-name').checked
            };
            localStorage.setItem('voicelive_privacy', JSON.stringify(settings));
            showToast('تم حفظ التفضيلات على هذا الجهاز', 'success');
        }

        function showToast(message, type = 'success') {
            const toast = document.getElementById('toast');
            const toastMsg = document.getElementById('toast-msg');
            const toastIcon = document.getElementById('toast-icon');

            toastMsg.innerText = message;
            if(type === 'success') {
                toastIcon.className = "fa-solid fa-circle-check text-emerald-400";
            } else if(type === 'error') {
                toastIcon.className = "fa-solid fa-circle-xmark text-red-400";
            } else {
                toastIcon.className = "fa-solid fa-circle-info text-violet-400";
            }

            toast.classList.remove('opacity-0', '-translate-y-5', 'pointer-events-none');
            setTimeout(() => {
                toast.classList.add('opacity-0', '-translate-y-5', 'pointer-events-none');
            }, 3000);
        }

        /* نظام تسجيل الدخول وإنشاء الحساب */
        function handleAuth(e) {
            e.preventDefault();
            const usernameInput = document.getElementById('auth-username').value.trim();
            const avatarInput = document.getElementById('auth-avatar').value.trim();
            // التسجيل العام لا يسمح بمنح صلاحيات إدارية
            const roleInput = 'user';

            if(!usernameInput) {
                showToast('يرجى كتابة اسم المستخدم', 'error');
                return;
            }

            state.user.name = usernameInput;
            state.user.role = roleInput;
            state.user.id = Math.floor(10000 + Math.random() * 90000).toString();
            if(avatarInput) state.user.avatar = avatarInput;

            updateUIState();
            closeAuthModal();
            showToast(`أهلاً بك يا ${state.user.name}! تم إنشاء حسابك بنجاح`);
        }

        function openAuthModal() {
            document.getElementById('auth-modal').classList.remove('hidden');
        }

        function closeAuthModal() {
            document.getElementById('auth-modal').classList.add('hidden');
        }

        function logoutAction() {
            openAuthModal();
            showToast('تم تسجيل الخروج بنجاح', 'info');
        }

        /* تحديث الواجهة وعناصر الرصيد والمستخدم */
        function updateUIState() {
            // بيانات الهيدر
            document.getElementById('nav-user-name').innerText = state.user.name;
            document.getElementById('nav-user-id').innerText = `ID: ${state.user.id}`;
            document.getElementById('nav-user-avatar').src = state.user.avatar;
            document.getElementById('nav-coins-count').innerText = state.user.coins.toLocaleString();
            
            // بيانات البروفايل
            document.getElementById('profile-name').innerText = state.user.name;
            document.getElementById('profile-id').innerText = `ID: ${state.user.id}`;
            document.getElementById('profile-avatar').src = state.user.avatar;
            document.getElementById('store-coins-count').innerText = state.user.coins.toLocaleString();

            const roleBadges = { admin: 'مالك التطبيق', agency: 'مدير وكالة', user: 'عضو' };
            const badgeText = roleBadges[state.user.role] || 'عضو';
            document.getElementById('nav-user-badge').innerText = badgeText;
            document.getElementById('profile-role-tag').innerText = badgeText;
        }

        /* نظام التنقل بين الصفحات بدون أخطاء (Page Router) */
        function switchView(viewName) {
            // منع المستخدم العادي من فتح صفحة المالك
            if (viewName === 'admin' && state.user.role !== 'admin') {
                showToast('ليس لديك صلاحية الوصول إلى لوحة المالك', 'error');
                return;
            }

            // إخفاء كل الواجهات
            document.querySelectorAll('.page-view').forEach(view => {
                view.classList.add('hidden');
            });

            // إزالة التحديد عن كل الأزرار
            document.querySelectorAll('.nav-tab').forEach(tab => {
                tab.classList.remove('text-violet-400');
                tab.classList.add('text-slate-400');
            });

            // إظهار الصفحة المختارة
            const targetView = document.getElementById(`view-${viewName}`);
            if (targetView) {
                targetView.classList.remove('hidden');
            }

            // تفعيل لون التبويب النشط
            const activeTab = document.getElementById(`tab-${viewName}`);
            if (activeTab) {
                activeTab.classList.remove('text-slate-400');
                activeTab.classList.add('text-violet-400');
            }

            // التمرير لأعلى الصفحة بنعومة
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        /* عرض الغرف المتاحة */
        function renderRooms() {
            const container = document.getElementById('rooms-list');
            container.innerHTML = '';

            state.rooms.forEach(room => {
                const roomEl = document.createElement('div');
                roomEl.className = "bg-slate-900 border border-slate-800 hover:border-violet-500/50 p-4 rounded-2xl flex items-center justify-between transition cursor-pointer active:scale-98";
                roomEl.onclick = () => joinRoom(room);
                roomEl.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-lg font-bold">
                            🎙️
                        </div>
                        <div>
                            <h4 class="font-bold text-sm text-white">${room.title}</h4>
                            <p class="text-xs text-slate-400">المالك: ${room.host}</p>
                            <span class="inline-block bg-violet-950 text-violet-300 text-[10px] px-2 py-0.5 rounded-md mt-1 border border-violet-800/40"># ${room.tag}</span>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="text-xs text-emerald-400 font-bold flex items-center gap-1 justify-end">
                            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                            ${room.online} متصل
                        </span>
                        <button class="mt-2 bg-violet-600/30 text-violet-300 text-xs px-3 py-1 rounded-xl border border-violet-500/30">دخول</button>
                    </div>
                `;
                container.appendChild(roomEl);
            });
        }

        /* الدخول لغرفة معينة */
        function joinRoom(room) {
            state.currentRoom = room;
            document.getElementById('current-room-title').innerText = room.title;
            document.getElementById('current-room-host').innerText = `المالك: ${room.host} | ID: ${room.id}`;
            switchView('room');
            showToast(`دخلت إلى: ${room.title}`);
        }

        function leaveRoom() {
            state.currentRoom = null;
            switchView('home');
            showToast('خرجت من الغرفة');
        }

        /* توليد مقاعد المايكات الـ 8 */
        function renderSeats() {
            const stage = document.getElementById('mics-stage');
            stage.innerHTML = '';

            state.seats.forEach((seat, idx) => {
                const seatBox = document.createElement('div');
                seatBox.className = "flex flex-col items-center gap-1";
                
                if (seat.user) {
                    seatBox.innerHTML = `
                        <div onclick="takeSeat(${idx})" class="w-12 h-12 rounded-full border-2 border-violet-500 relative flex items-center justify-center cursor-pointer ${seat.isSpeaking ? 'speaking' : ''}">
                            <img src="${seat.avatar}" class="w-full h-full rounded-full object-cover">
                            <span class="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center">
                                <i class="fa-solid fa-microphone"></i>
                            </span>
                        </div>
                        <span class="text-[10px] font-bold text-slate-300 truncate w-14 text-center">${seat.user}</span>
                    `;
                } else {
                    seatBox.innerHTML = `
                        <div onclick="takeSeat(${idx})" class="w-12 h-12 rounded-full border-2 border-dashed border-slate-700 bg-slate-950 hover:border-violet-500 flex items-center justify-center cursor-pointer transition">
                            <i class="fa-solid fa-plus text-slate-500 text-xs"></i>
                        </div>
                        <span class="text-[10px] text-slate-500">مقعد ${seat.seatNum}</span>
                    `;
                }
                stage.appendChild(seatBox);
            });
        }

        /* الصعود على المايك / النزول */
        function takeSeat(seatIndex) {
            if (state.seats[seatIndex].user === state.user.name) {
                // إذا كان هو من يشغل المقعد يتركه
                state.seats[seatIndex].user = null;
                showToast(`تركت المقعد ${seatIndex + 1}`);
            } else {
                state.seats[seatIndex].user = state.user.name;
                state.seats[seatIndex].avatar = state.user.avatar;
                state.seats[seatIndex].isSpeaking = true;
                showToast(`صعدت على المايك رقم ${seatIndex + 1}! تحدث الآن`);
            }
            renderSeats();
        }

        /* كتم وتشغيل المايك الخاص بك */
        function toggleMyMic() {
            state.isMicMuted = !state.isMicMuted;
            const icon = document.getElementById('mic-toggle-icon');
            const text = document.getElementById('mic-toggle-text');

            if(state.isMicMuted) {
                icon.className = "fa-solid fa-microphone-slash text-red-400";
                text.innerText = "المايك مغلق";
                showToast('تم كتم المايك الخاص بك', 'info');
            } else {
                icon.className = "fa-solid fa-microphone text-emerald-400";
                text.innerText = "المايك مفتوح";
                showToast('المايك مفتوح والصوت يعمل');
            }
        }

        /* إرسال رسالة في شات الغرفة */
        function sendChatMessage() {
            const input = document.getElementById('room-chat-input');
            const text = input.value.trim();
            if(!text) return;

            const chatContainer = document.getElementById('room-messages');
            const msgEl = document.createElement('div');
            msgEl.className = "bg-slate-950/80 border border-slate-800 p-2 rounded-xl";
            msgEl.innerHTML = `
                <span class="font-bold text-violet-400 ml-1">${state.user.name}:</span>
                <span class="text-slate-200">${text}</span>
            `;
            chatContainer.appendChild(msgEl);
            input.value = '';
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        /* نافذة ونظام إرسال الهدايا بالعملات */
        function toggleGiftModal() {
            const modal = document.getElementById('gift-modal');
            modal.classList.toggle('hidden');
        }

        function sendGift(giftName, price) {
            if(state.user.coins < price) {
                showToast('رصيدك من العملات لا يكفي! قم بالشحن من المتجر', 'error');
                toggleGiftModal();
                switchView('store');
                return;
            }

            state.user.coins -= price;
            updateUIState();
            toggleGiftModal();

            // رسالة الهدايا العامة داخل شات الروم
            const chatContainer = document.getElementById('room-messages');
            const giftMsg = document.createElement('div');
            giftMsg.className = "bg-amber-400/20 border border-amber-400/40 p-2.5 rounded-xl text-amber-300 font-bold text-center";
            giftMsg.innerHTML = `🎉 قام ${state.user.name} بإرسال [${giftName}] بقيمة ${price} عملة!`;
            chatContainer.appendChild(giftMsg);
            chatContainer.scrollTop = chatContainer.scrollHeight;

            showToast(`تم إرسال ${giftName} بنجاح!`);
        }

        /* شحن العملات */
        
        const VODAFONE_CASH_NUMBER = '';
        function selectRechargePack(amount) {
            const input = document.getElementById('recharge-amount');
            if (!input) return;
            input.value = amount;
            updateRechargePreview();
            document.getElementById('recharge-request-form')?.scrollIntoView({behavior:'smooth', block:'center'});
        }
        function updateRechargePreview() {
            const amount = Number(document.getElementById('recharge-amount')?.value || 0);
            const preview = document.getElementById('recharge-coins-preview');
            if (preview) preview.textContent = amount >= 100 && amount % 100 === 0
                ? `ستحصل على ${(amount * 1100).toLocaleString('en-US')} عملة عند الموافقة`
                : 'اختر مبلغًا لا يقل عن 100 جنيه ويكون من مضاعفات 100 جنيه';
        }
        function copyVodafoneNumber() {
            if (!VODAFONE_CASH_NUMBER) {
                showToast('رقم فودافون كاش لم يحدده المالك بعد');
                return;
            }
            navigator.clipboard?.writeText(VODAFONE_CASH_NUMBER)
                .then(() => showToast('تم نسخ رقم المحفظة'))
                .catch(() => showToast('رقم المحفظة: ' + VODAFONE_CASH_NUMBER));
        }
        async function submitRechargeRequest(event) {
            event.preventDefault();
            const amount = Number(document.getElementById('recharge-amount').value);
            const sender = document.getElementById('recharge-sender').value.trim();
            const reference = document.getElementById('recharge-reference').value.trim();
            const file = document.getElementById('recharge-receipt').files[0];
            if (!VODAFONE_CASH_NUMBER) {
                showToast('لا يمكن إرسال الطلب قبل أن يحدد المالك رقم فودافون كاش');
                return;
            }
            if (!Number.isInteger(amount) || amount < 100 || amount % 100 !== 0) {
                showToast('المبلغ يجب أن يكون 100 جنيه أو مضاعفاته');
                return;
            }
            if (!file || !file.type.startsWith('image/')) {
                showToast('اختر صورة إيصال التحويل');
                return;
            }
            const requests = JSON.parse(localStorage.getItem('voicelive_recharge_requests') || '[]');
            requests.unshift({
                id: 'RC' + Date.now(),
                amount,
                coins: amount * 1100,
                sender,
                reference,
                receiptName: file.name,
                status: 'pending',
                createdAt: new Date().toISOString()
            });
            localStorage.setItem('voicelive_recharge_requests', JSON.stringify(requests.slice(0, 30)));
            renderRechargeRequests();
            event.target.reset();
            updateRechargePreview();
            showToast('تم تسجيل الطلب محليًا للمراجعة، ولم تتم إضافة العملات');
        }
        function renderRechargeRequests() {
            const el = document.getElementById('recharge-requests-list');
            if (!el) return;
            const requests = JSON.parse(localStorage.getItem('voicelive_recharge_requests') || '[]');
            el.innerHTML = '<h4 class="font-bold text-white my-3">طلبات الشحن على هذا الجهاز</h4>' +
                (requests.length ? requests.map(r =>
                    `<div class="border border-slate-700 rounded-xl p-3 mb-2">طلب ${r.id} — ${r.amount.toLocaleString('en-US')} جنيه / ${r.coins.toLocaleString('en-US')} عملة<br>الحالة: قيد المراجعة<br>الإيصال المختار: ${String(r.receiptName).replace(/[&<>"]/g, '')}</div>`
                ).join('') : 'لا توجد طلبات شحن بعد.');
        }

        function rechargeCoins(amount, price) { showToast('الشحن الفوري متوقف. استخدم طلب فودافون كاش للمراجعة.'); }

        /* نظام الوكالات */
        function agencyJoinAction() {
            showToast('تم استلام طلب انضمامك للوكالة وسيتم الرد خلال 24 ساعة');
        }

        function applyToSpecificAgency(name) {
            showToast(`تم التقديم على وكالة: ${name}`);
        }

        /* لوحة تحكم المالك */
        function adminGiftCoinsAll() {
            state.user.coins += 500;
            updateUIState();
            showToast('تم إرسال 500 عملة لكل المستخدمين على السيرفر!');
        }

        function adminBanUser(id) {
            showToast(`تم حظر المستخدم صاحب المعرّف (ID: ${id}) ومنعه من السيرفر`, 'error');
        }

        function adminToggleSystemMaintenance() {
            showToast('تم تبديل حالة صيانة السيرفر بنجاح', 'info');
        }

        function createRoomPrompt() {
            const name = prompt('اكتب اسم غرفتك الصوتية الجديدة:');
            if(name) {
                const newRoom = {
                    id: Math.floor(100 + Math.random() * 900),
                    title: name,
                    host: state.user.name,
                    online: 1,
                    tag: 'عام'
                };
                state.rooms.unshift(newRoom);
                renderRooms();
                joinRoom(newRoom);
                showToast('تم إنشاء غرفتك الخاصة بنجاح!');
            }
        }
    

(function () {
  const prices = [
    3000000, 6000000, 9000000, 12000000,
    20000000, 40000000, 100000000, 250000000,
    625000000, 1562500000, 3906250000, 9765625000
  ];
  const names = [
    'VIP 1', 'VIP 2', 'VIP 3', 'VIP 4',
    'كبار الشخصيات', 'كبار الشخصيات',
    'نجوم', 'نجوم', 'نجوم',
    'أساطير', 'أساطير', 'أساطير'
  ];

  window.selectVipLevel = function (level) {
    level = Number(level);
    if (!Number.isInteger(level) || level < 1 || level > 12) return;
    const title = document.getElementById('vip-selected-title');
    const desc = document.getElementById('vip-selected-description');
    const price = document.getElementById('vip-selected-price');
    if (title) title.textContent = 'VIP ' + level + ' — ' + names[level - 1];
    if (desc) desc.textContent = 'فئة ' + names[level - 1] + '، والترقية تتطلب الرصيد الموضح أدناه.';
    if (price) price.textContent = prices[level - 1].toLocaleString('en-US') + ' عملة';
    document.querySelectorAll('.vip-level-card').forEach(function (el, index) {
      el.classList.toggle('border-amber-400', index + 1 === level);
      el.classList.toggle('border-slate-800', index + 1 !== level);
    });
  };

  const current = document.getElementById('vip-current-level');
  if (current) {
    let level = Number(localStorage.getItem('voicelive_vip_level') || 0);
    if (!Number.isInteger(level) || level < 0 || level > 12) level = 0;
    current.textContent = 'VIP ' + level;
  }
  window.selectVipLevel(1);
})();
