// Конфигурация
const SUPABASE_URL = 'https://zfqpfhtbpfdudbpqzbbg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmcXBmaHRicGZkdWRicHF6YmJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTQ5NzQsImV4cCI6MjA4Mzg3MDk3NH0.QnmNeFn9LX9ZIc-bINH_4DNKFeJj9LCYU7QF5ZwfaDE';

// Инициализация само ако не е направена вече
if (!window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

const supabase = window.supabaseClient;

document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signupForm');
    const loginForm = document.getElementById('loginForm');

    // ЛОГИКА ЗА РЕГИСТРАЦИЯ
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msg = document.getElementById('signupMessage');
            msg.textContent = 'Обработка...';
            msg.style.color = '#fff';

            const email = signupForm.email.value;
            const password = signupForm.password.value;
            const name = signupForm.name.value;

            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: { full_name: name }
                }
            });

            if (error) {
                msg.style.color = '#ffb4b4';
                msg.textContent = error.message;
            } else {
                msg.style.color = 'lightgreen';
                msg.textContent = 'Успех! Вече можете да влезете от страницата за вход.';
                signupForm.reset();
            }
        });
    }

    // ЛОГИКА ЗА ВХОД
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msg = document.getElementById('loginMessage');
            msg.textContent = 'Влизане...';
            msg.style.color = '#fff';

            const { data, error } = await supabase.auth.signInWithPassword({
                email: loginForm.email.value,
                password: loginForm.password.value
            });

            if (error) {
                msg.style.color = '#ffb4b4';
                msg.textContent = 'Грешен имейл или парола.';
            } else {
                localStorage.setItem('ss_token', data.session.access_token);
                // Пренасочване към началната страница
                window.location.href = 'homepage (3).html';
            }
        });
    }
});
