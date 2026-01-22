// --- КОНФИГУРАЦИЯ НА SUPABASE ---
const SUPABASE_URL = 'https://zfqpfhtbpfdudbpqzbbg.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmcXBmaHRicGZkdWRicHF6YmJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTQ5NzQsImV4cCI6MjA4Mzg3MDk3NH0.QnmNeFn9LX9ZIc-bINH_4DNKFeJj9LCYU7QF5ZwfaDE';

// Инициализиране на Supabase клиента
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.addEventListener('DOMContentLoaded', () => {
  const signupForm = document.getElementById('signupForm');
  const loginForm = document.getElementById('loginForm');

  // --- РЕГИСТРАЦИЯ ---
  if(signupForm){
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('signupMessage');
      msg.textContent = 'Създаване на профил...';
      
      const { data, error } = await supabase.auth.signUp({
        email: signupForm.email.value.trim(),
        password: signupForm.password.value,
        options: { data: { full_name: signupForm.name.value.trim() } }
      });

      if (error) {
        msg.style.color = 'red';
        msg.textContent = error.message;
      } else {
        msg.style.color = 'lightgreen';
        msg.textContent = 'Успех! Вече можете да влезете.';
        signupForm.reset();
      }
    });
  }

  // --- ВХОД ---
  if(loginForm){
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('loginMessage');
      msg.textContent = 'Влизане...';

      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email.value.trim(),
        password: loginForm.password.value
      });

      if (error) {
        msg.style.color = 'red';
        msg.textContent = 'Грешен имейл или парола.';
      } else {
        msg.style.color = 'lightgreen';
        msg.textContent = 'Успешно влизане!';
        // Запазваме сесията
        if(data.session) localStorage.setItem('ss_token', data.session.access_token);
        // Пренасочване към началната страница
        setTimeout(() => location.href = 'homepage (3).html', 700);
      }
    });
  }
});

// Хелпър за другите страници (за да не се чупят)
window.ssApi = {
  async getUser() {
    const { data } = await supabase.auth.getUser();
    return data.user;
  },
  async logout() {
    await supabase.auth.signOut();
    location.href = 'index.html';
  }
};
