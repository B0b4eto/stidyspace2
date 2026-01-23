(function() {
    // 1. Конфигурация
    const URL = 'https://zfqpfhtbpfdudbpqzbbg.supabase.co';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmcXBmaHRicGZkdWRicHF6YmJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTQ5NzQsImV4cCI6MjA4Mzg3MDk3NH0.QnmNeFn9LX9ZIc-bINH_4DNKFeJj9LCYU7QF5ZwfaDE';

    // 2. Инициализация само ако не съществува
    if (!window.sb) {
        window.sb = window.supabase.createClient(URL, KEY);
    }

    const sb = window.sb;

    document.addEventListener('DOMContentLoaded', () => {
        const signupForm = document.getElementById('signupForm');
        const loginForm = document.getElementById('loginForm');

        // ЛОГИКА ЗА РЕГИСТРАЦИЯ
        if (signupForm) {
            signupForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const msg = document.getElementById('signupMessage');
                msg.textContent = 'Обработка...';
                
                const { error } = await sb.auth.signUp({
                    email: signupForm.email.value,
                    password: signupForm.password.value,
                    options: { data: { full_name: signupForm.name.value } }
                });

                if (error) {
                    msg.style.color = '#ffb4b4';
                    msg.textContent = error.message;
                } else {
                    msg.style.color = 'lightgreen';
                    msg.textContent = 'Успех! Вече можете да влезете.';
                }
            });
        }

        // ЛОГИКА ЗА ВХОД
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const msg = document.getElementById('loginMessage');
                msg.textContent = 'Влизане...';

                const { data, error } = await sb.auth.signInWithPassword({
                    email: loginForm.email.value,
                    password: loginForm.password.value
                });

                if (error) {
                    msg.style.color = '#ffb4b4';
                    msg.textContent = 'Грешен имейл или парола.';
                } else {
                    localStorage.setItem('ss_token', data.session.access_token);
                    window.location.href = 'homepage (3).html';
                }
            });
        }
    });
})();
