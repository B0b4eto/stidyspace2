// Проверка дали вече не е дефинирано, за да няма грешки
if (typeof supabase === 'undefined') {
    var SUPABASE_URL = 'https://zfqpfhtbpfdudbpqzbbg.supabase.co';
    var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmcXBmaHRicGZkdWRicHF6YmJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTQ5NzQsImV4cCI6MjA4Mzg3MDk3NH0.QnmNeFn9LX9ZIc-bINH_4DNKFeJj9LCYU7QF5ZwfaDE';
    var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signupForm');
    const loginForm = document.getElementById('loginForm');

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msg = document.getElementById('signupMessage');
            msg.textContent = 'Обработка...';
            const { error } = await supabase.auth.signUp({
                email: signupForm.email.value,
                password: signupForm.password.value,
                options: { data: { full_name: signupForm.name.value } }
            });
            if (error) { msg.style.color = 'red'; msg.textContent = error.message; }
            else { msg.style.color = 'lightgreen'; msg.textContent = 'Успех! Вече можете да влезете.'; }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msg = document.getElementById('loginMessage');
            msg.textContent = 'Влизане...';
            const { data, error } = await supabase.auth.signInWithPassword({
                email: loginForm.email.value,
                password: loginForm.password.value
            });
            if (error) { msg.style.color = 'red'; msg.textContent = 'Грешен имейл или парола.'; }
            else {
                localStorage.setItem('ss_token', data.session.access_token);
                location.href = 'homepage (3).html';
            }
        });
    }
});
