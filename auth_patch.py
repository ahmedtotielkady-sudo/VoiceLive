from pathlib import Path
from datetime import datetime
import re, sys

p = Path("www/index.html")
s = p.read_text()

backup = Path("www/index.html.backup-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
backup.write_text(s)

# إزالة الحساب التجريبي حتى لا يدخل التطبيق تلقائياً
pattern = r"user:\s*\{\s*id:\s*'88492',\s*name:\s*'أمير الليل',\s*avatar:\s*'[^']*',\s*coins:\s*1500,\s*role:\s*'user'\s*// الدور الافتراضي الآمن\s*\}"
s2, n = re.subn(pattern, "user: null", s, count=1)

if n != 1:
    print("لم يتغير الملف: لم أتعرف على كتلة المستخدم التجريبي.")
    print("النسخة الاحتياطية:", backup)
    sys.exit(1)

old_init = """window.addEventListener('DOMContentLoaded', () => {
            loadPrivacySettings();
            renderRooms();
            renderSeats();
            updateUIState();
        });"""

new_init = """window.addEventListener('DOMContentLoaded', () => {
            loadPrivacySettings();
            renderRooms();
            renderSeats();
            let session = null;
            try { session = JSON.parse(localStorage.getItem('voicelive_session') || 'null'); } catch (_) {}
            if (session && session.id && session.name) {
                state.user = session;
                updateUIState();
                closeAuthModal();
            } else {
                state.user = null;
                document.querySelectorAll('.page-view').forEach(v => v.classList.add('hidden'));
                openAuthModal();
                setAuthMode('login');
            }
        });"""

if old_init not in s2:
    print("لم أجد كود التهيئة المتوقع؛ لم أكتب التعديل.")
    print("النسخة الاحتياطية:", backup)
    sys.exit(1)

s2 = s2.replace(old_init, new_init, 1)

form_pattern = r'<form id="auth-form" onsubmit="handleAuth\(event\)" class="vl-form">.*?</form>'
new_form = """<form id="auth-form" onsubmit="handleAuth(event)" class="vl-form">
                    <div class="flex gap-2 mb-4">
                        <button type="button" class="vl-submit" onclick="setAuthMode('login')">تسجيل الدخول</button>
                        <button type="button" class="vl-submit" onclick="setAuthMode('register')">إنشاء حساب</button>
                    </div>
                    <label for="auth-username">اسم المستخدم</label>
                    <input type="text" id="auth-username" required minlength="3" maxlength="30" autocomplete="username" placeholder="اكتب اسم المستخدم">
                    <label for="auth-password">كلمة المرور</label>
                    <input type="password" id="auth-password" required minlength="8" autocomplete="current-password" placeholder="8 أحرف على الأقل">
                    <div id="auth-confirm-wrap" class="hidden">
                        <label for="auth-confirm-password">تأكيد كلمة المرور</label>
                        <input type="password" id="auth-confirm-password" minlength="8" autocomplete="new-password" placeholder="أعد كتابة كلمة المرور">
                    </div>
                    <label for="auth-avatar">رابط الصورة الشخصية (اختياري)</label>
                    <input type="url" id="auth-avatar" placeholder="https://...">
                    <p class="vl-member"><i class="fa-solid fa-user"></i> نوع الحساب: عضو</p>
                    <button type="submit" id="auth-submit" class="vl-submit">تسجيل الدخول</button>
                    <p class="text-xs opacity-70 mt-3">نسخة تجريبية: الحسابات محفوظة على هذا الجهاز فقط.</p>
                </form>"""

s2, n = re.subn(form_pattern, lambda _: new_form, s2, count=1, flags=re.S)
if n != 1:
    print("لم أجد نموذج الحسابات كاملاً؛ لم أكتب التعديل.")
    print("النسخة الاحتياطية:", backup)
    sys.exit(1)

start = s2.find("        function handleAuth(e) {")
end = s2.find("        /* تحديث الواجهة وعناصر الرصيد والمستخدم */", start)
if start < 0 or end < 0:
    print("لم أجد حدود دوال الدخول والخروج؛ لم أكتب التعديل.")
    print("النسخة الاحتياطية:", backup)
    sys.exit(1)

functions = r'''        let authMode = 'login';

        function setAuthMode(mode) {
            authMode = mode === 'register' ? 'register' : 'login';
            const wrap = document.getElementById('auth-confirm-wrap');
            const confirm = document.getElementById('auth-confirm-password');
            wrap.classList.toggle('hidden', authMode !== 'register');
            confirm.required = authMode === 'register';
            document.getElementById('auth-password').autocomplete =
                authMode === 'register' ? 'new-password' : 'current-password';
            document.getElementById('auth-submit').textContent =
                authMode === 'register' ? 'إنشاء الحساب والدخول' : 'تسجيل الدخول';
        }

        async function hashPassword(password) {
            const data = new TextEncoder().encode(password);
            const digest = await crypto.subtle.digest('SHA-256', data);
            return Array.from(new Uint8Array(digest))
                .map(b => b.toString(16).padStart(2, '0')).join('');
        }

        async function handleAuth(e) {
            e.preventDefault();
            const name = document.getElementById('auth-username').value.trim();
            const password = document.getElementById('auth-password').value;
            const confirm = document.getElementById('auth-confirm-password').value;
            const avatar = document.getElementById('auth-avatar').value.trim();

            if (name.length < 3 || name.length > 30 || password.length < 8) {
                showToast('اكتب اسم مستخدم من 3 أحرف وكلمة مرور من 8 أحرف على الأقل', 'error');
                return;
            }

            let accounts = {};
            try { accounts = JSON.parse(localStorage.getItem('voicelive_accounts') || '{}'); } catch (_) {}
            const key = name.toLocaleLowerCase();

            if (authMode === 'register') {
                if (password !== confirm) {
                    showToast('كلمتا المرور غير متطابقتين', 'error');
                    return;
                }
                if (accounts[key]) {
                    showToast('هذا الاسم مسجل بالفعل؛ اختر تسجيل الدخول', 'error');
                    return;
                }
                accounts[key] = {
                    name,
                    passwordHash: await hashPassword(password),
                    id: Math.floor(10000 + Math.random() * 90000).toString(),
                    avatar: avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
                    coins: 1500
                };
                localStorage.setItem('voicelive_accounts', JSON.stringify(accounts));
            } else {
                if (!accounts[key] || accounts[key].passwordHash !== await hashPassword(password)) {
                    showToast('اسم المستخدم أو كلمة المرور غير صحيحة', 'error');
                    return;
                }
            }

            const account = accounts[key];
            state.user = {
                id: account.id,
                name: account.name,
                avatar: account.avatar,
                coins: account.coins || 0,
                role: 'user'
            };
            localStorage.setItem('voicelive_session', JSON.stringify(state.user));
            updateUIState();
            closeAuthModal();
            document.querySelectorAll('.page-view').forEach(v => v.classList.add('hidden'));
            const rooms = document.getElementById('view-rooms');
            if (rooms) rooms.classList.remove('hidden');
            document.getElementById('auth-form').reset();
            setAuthMode('login');
            showToast('تم الدخول بنجاح يا ' + state.user.name);
        }

        function openAuthModal() {
            document.getElementById('auth-modal').classList.remove('hidden');
        }

        function closeAuthModal() {
            document.getElementById('auth-modal').classList.add('hidden');
        }

        function logoutAction() {
            localStorage.removeItem('voicelive_session');
            state.user = null;
            document.querySelectorAll('.page-view').forEach(v => v.classList.add('hidden'));
            openAuthModal();
            setAuthMode('login');
            showToast('تم تسجيل الخروج', 'info');
        }

'''
s2 = s2[:start] + functions + s2[end:]

needle = "        function switchView(viewName) {"
s2 = s2.replace(needle, needle + """
            if (!state.user) {
                openAuthModal();
                return;
            }""", 1)

p.write_text(s2)
print("نجح التعديل.")
print("النسخة الاحتياطية:", backup)
