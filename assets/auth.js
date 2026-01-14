// --- КОНФИГУРАЦИЯ НА SUPABASE ---
// ПОПЪЛНИ ТУК ДАННИТЕ ОТ SUPABASE DASHBOARD -> SETTINGS -> API
const SUPABASE_URL = 'https://zfqpfhtbpfdudbpqzbbg.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmcXBmaHRicGZkdWRicHF6YmJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTQ5NzQsImV4cCI6MjA4Mzg3MDk3NH0.QnmNeFn9LX9ZIc-bINH_4DNKFeJj9LCYU7QF5ZwfaDE';

// Инициализиране на клиента (библиотеката, която добавихме в HTML)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- ЛОГИКА ЗА SIGNUP И LOGIN ---
document.addEventListener('DOMContentLoaded', () => {
  const signupForm = document.getElementById('signupForm');
  const loginForm = document.getElementById('loginForm');

  // Логика за Регистрация
  if(signupForm){
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('signupMessage');
      msg.textContent = 'Creating account...';
      
      const name = signupForm.name.value.trim();
      const email = signupForm.email.value.trim();
      const password = signupForm.password.value;

      // Директна заявка към Supabase
      const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: { data: { full_name: name } }
      });

      if (error) {
        msg.style.color = 'red';
        msg.textContent = error.message;
      } else {
        msg.style.color = 'lightgreen';
        msg.textContent = 'Account created! Redirecting...';
        // Запазваме сесията ръчно за всеки случай
        localStorage.setItem('ss_token', data.session?.access_token);
        setTimeout(() => location.href = '../homepage (3).html', 1000); // Промених го към homepage
      }
    });
  }

  // Логика за Вход (Login)
  if(loginForm){
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('loginMessage');
      msg.textContent = 'Logging in...';

      const email = loginForm.email.value.trim();
      const password = loginForm.password.value;

      // Директна заявка към Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) {
        msg.style.color = 'red';
        msg.textContent = 'Invalid email or password';
      } else {
        msg.style.color = 'lightgreen';
        msg.textContent = 'Success! Redirecting...';
        // Supabase автоматично пази сесията, но за съвместимост:
        if(data.session) {
            localStorage.setItem('ss_token', data.session.access_token);
        }
        setTimeout(() => location.href = '../homepage (3).html', 700);
      }
    });
  }
});

// --- API ХЕЛПЪР (Замества стария ssApi) ---
// Това позволява на другите страници (homepage, studio) да работят без промяна
window.ssApi = {
  // Проверка дали сме логнати
  async isAuthenticated() {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  },

  // Опресняване на сесията (Supabase го прави автоматично, но оставяме функцията празна за съвместимост)
  async refresh(){
    const { data } = await supabase.auth.getSession();
    if (data.session) {
        localStorage.setItem('ss_token', data.session.access_token);
        return true;
    }
    return false;
  },

  // Взимане на блоковете (Homepage)
  async getBlocks(){
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'No user' };

    const { data, error } = await supabase
      .from('user_blocks')
      .select('*')
      .eq('user_id', user.id);

    return { ok: !error, blocks: data || [] };
  },

  // Запазване на блоковете
  async saveBlocks(blocks){
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false };

    // Първо трием старите (лесна стратегия), после добавяме новите
    await supabase.from('user_blocks').delete().eq('user_id', user.id);
    
    // Подготвяме данните за insert
    const records = blocks.map(b => ({
        user_id: user.id,
        block_key: b.block_key,
        position: b.position,
        style: b.style
    }));

    const { data, error } = await supabase.from('user_blocks').insert(records).select();
    return { ok: !error, blocks: data };
  },

  // Взимане на флашкарти
  async getRecentFlashcards(){
    const { data: { user } } = await supabase.auth.getUser();
    if(!user) return { ok: false };

    const { data, error } = await supabase
        .from('flashcards')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(20);
    
    return { ok: !error, cards: data || [] };
  },

  // Създаване на една карта
  async createFlashcard(card){
    const { data: { user } } = await supabase.auth.getUser();
    
    const newCard = {
        id: card.id, // Използваме ID от фронтенда
        user_id: user.id,
        front: card.front,
        back: card.back,
        tags: card.tags,
        metadata: card.metadata,
        created_at: new Date(),
        updated_at: new Date()
    };

    const { data, error } = await supabase.from('flashcards').insert([newCard]).select();
    return { ok: !error, card: data ? data[0] : null };
  },
  
  // Запазване на масив от карти (Bulk update)
  async saveFlashcards(cards){
     // За по-просто тук ще използваме loop или upsert
     const { data: { user } } = await supabase.auth.getUser();
     
     const records = cards.map(c => ({
         id: c.id,
         user_id: user.id,
         front: c.front,
         back: c.back,
         tags: c.tags,
         metadata: c.metadata,
         updated_at: new Date()
     }));

     const { data, error } = await supabase.from('flashcards').upsert(records).select();
     return { ok: !error, cards: data };
  }
};