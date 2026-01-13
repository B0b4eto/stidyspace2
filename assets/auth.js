// Lightweight client-side auth helpers for the static pages

// ТОВА Е ВАЖНОТО: Тук казваме къде се намира сървърът
const API_BASE = 'https://stidyspace2.onrender.com';

async function postJson(url, data){
  // Тук добавяме API_BASE пред адреса
  const res = await fetch(API_BASE + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json().catch(() => ({ ok: res.ok }));
}

document.addEventListener('DOMContentLoaded', () => {
  const signupForm = document.getElementById('signupForm');
  const loginForm = document.getElementById('loginForm');

  if(signupForm){
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('signupMessage');
      msg.textContent = '';
      const data = {
        name: signupForm.name.value.trim(),
        email: signupForm.email.value.trim().toLowerCase(),
        password: signupForm.password.value
      };
      try{
        const resp = await postJson('/api/signup', data);
        if(resp && resp.ok){
          msg.style.color = 'lightgreen';
          msg.textContent = 'Account created — redirecting...';
      auth setTimeout(()=> location.href = '../home.html', 700);
        } else {
          msg.style.color = '';
          msg.textContent = resp && resp.error ? resp.error : 'Signup failed';
        }
      }catch(err){
        console.error(err);
        msg.textContent = 'Network error - Is server running?';
      }
    });
  }

  if(loginForm){
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('loginMessage');
      msg.textContent = '';
      const data = {
        email: loginForm.email.value.trim().toLowerCase(),
        password: loginForm.password.value
      };
      try{
        const resp = await postJson('/api/login', data);
        if(resp && resp.ok){
          if(resp.session){
            try{
              const s = resp.session;
              if(s.access_token) localStorage.setItem('ss_token', s.access_token);
              if(s.refresh_token) localStorage.setItem('ss_refresh', s.refresh_token);
            }catch(e){}
          } else if(resp.token){
            localStorage.setItem('ss_token', resp.token);
          }
          msg.style.color = 'lightgreen';
          msg.textContent = 'Logged in — redirecting...';
          // Тук също оправяме пътя, ако е нужно
          setTimeout(()=> location.href = '../Flashcardcreate.html', 700);
        } else {
          msg.style.color = '';
          msg.textContent = resp && resp.error ? resp.error : 'Login failed';
        }
      }catch(err){
        console.error(err);
        msg.textContent = 'Network error - check console';
      }
    });
  }
});

// Simple API helper for authenticated requests from the client
window.ssApi = {
  async authFetch(path, opts = {}){
    const token = localStorage.getItem('ss_token');
    const headers = Object.assign({}, opts.headers || {});
    if(token) headers['Authorization'] = `Bearer ${token}`;
    if(!headers['Content-Type'] && opts.body) headers['Content-Type'] = 'application/json';
    
    // Добавяме API_BASE и тук
    let res = await fetch(API_BASE + path, Object.assign({}, opts, { headers }));
    
    if(res.status === 401){
      const refreshed = await this.refresh();
      if(refreshed){
        const newToken = localStorage.getItem('ss_token');
        if(newToken) headers['Authorization'] = `Bearer ${newToken}`;
        res = await fetch(API_BASE + path, Object.assign({}, opts, { headers }));
      }
    }
    return res.json().catch(() => ({ ok: res.ok }));
  },
  async refresh(){
    const refresh_token = localStorage.getItem('ss_refresh');
    if(!refresh_token) return false;
    try{
      // И тук добавяме API_BASE
      const res = await fetch(API_BASE + '/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token })
      });
      const data = await res.json();
      if(res.ok && data && data.session){
        const s = data.session;
        if(s.access_token) localStorage.setItem('ss_token', s.access_token);
        if(s.refresh_token) localStorage.setItem('ss_refresh', s.refresh_token);
        return true;
      }
    }catch(e){
      console.error('refresh failed', e);
    }
    return false;
  },
  async getBlocks(){
    return this.authFetch('/api/blocks');
  },
  async saveBlocks(blocks){
    return this.authFetch('/api/blocks', { method: 'PUT', body: JSON.stringify({ blocks }) });
  }
  ,
  async saveFlashcards(cards){
    return this.authFetch('/api/flashcards', { method: 'PUT', body: JSON.stringify({ cards }) });
  },
  async getRecentFlashcards(){
    return this.authFetch('/api/flashcards/recent');
  },
  async createFlashcard(card){
    return this.authFetch('/api/flashcards', { method: 'POST', body: JSON.stringify(card) });
  },
  async getFlashcard(id){
    return this.authFetch(`/api/flashcards/${encodeURIComponent(id)}`);
  },
  async updateFlashcard(id, card){
    return this.authFetch(`/api/flashcards/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(card) });
  },
  async deleteFlashcard(id){
    return this.authFetch(`/api/flashcards/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  async uploadFile(payload){
    if(payload && payload.file instanceof File){
      const token = localStorage.getItem('ss_token');
      const form = new FormData();
      form.append('file', payload.file, payload.name || payload.file.name);
      const headers = {};
      if(token) headers['Authorization'] = `Bearer ${token}`;
      // И за качване на файлове добавяме API_BASE
      const res = await fetch(API_BASE + '/api/upload', { method: 'POST', body: form, headers });
      return res.json().catch(() => ({ ok: res.ok }));
    }
    return this.authFetch('/api/upload', { method: 'POST', body: JSON.stringify(payload) });
  }
};