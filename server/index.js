require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const uploadMiddleware = multer();

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// Optional Supabase client (server uses Supabase for auth/storage)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE;
let supabase = null;
if(SUPABASE_URL && SUPABASE_KEY){
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('Supabase client configured');
}

// Use the provided SUPABASE_KEY as a fallback server JWT secret when no explicit
// SERVER_JWT_SECRET is provided. This lets the token you pasted be used to sign
// server-issued JWTs for client sessions if Supabase isn't configured.
const SERVER_JWT_SECRET = process.env.SERVER_JWT_SECRET || SUPABASE_KEY || 'dev-local-secret';

// Note: auth and storage are handled exclusively via Supabase when configured.
// Local Postgres fallback has been removed to simplify and rely on Supabase Auth.
if(!supabase){
  console.warn('Warning: SUPABASE_URL or SUPABASE_KEY not set. Auth endpoints will return 501.');
}

app.post('/api/auth/signup', async (req, res) => {
  try{
    const { name, email, password } = req.body;
    if(!email || !password) return res.status(400).json({ ok:false, error: 'Missing email or password' });
    if(!supabase) return res.status(501).json({ ok:false, error: 'Supabase not configured' });
    if(supabase){
      // Use Supabase Auth to create the user
      const { data, error } = await supabase.auth.signUp({
        email: email.toLowerCase(),
        password,
        options: { data: { full_name: name } }
      });
      if(error) return res.status(400).json({ ok:false, error: error.message || 'Signup failed' });
      // signUp may not return a session when email confirmation is required
      return res.json({ ok:true, user: data.user || null, session: data.session || null, message: 'Check your email to confirm sign up if required' });
    }
    // fallback removed
    return res.status(500).json({ ok:false, error: 'Unexpected error' });
  }catch(err){
    console.error(err);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try{
    const { email, password } = req.body;
    if(!email || !password) return res.status(400).json({ ok:false, error: 'Missing email or password' });
    if(!supabase) return res.status(501).json({ ok:false, error: 'Supabase not configured' });
    if(supabase){
      // Use Supabase Auth to sign in and return the access token
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.toLowerCase(), password });
      if(error) return res.status(401).json({ ok:false, error: error.message || 'Invalid credentials' });
      // data.session contains access_token and refresh_token
      const session = data.session || null;
      const user = data.user || null;
      return res.json({ ok:true, user, session, token: session?.access_token || null });
    }
    // fallback removed
    return res.status(500).json({ ok:false, error: 'Unexpected error' });
  }catch(err){
    console.error(err);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// Auth middleware: accepts either a server-signed JWT (our SERVER_JWT_SECRET)
// or a Supabase access token (if supabase client is configured).
async function verifyAuth(req, res, next){
  try{
    const header = req.headers.authorization || '';
    const parts = header.split(' ');
    if(parts.length !== 2) return res.status(401).json({ ok:false, error: 'Unauthorized' });
    const token = parts[1];
    // Only Supabase token verification is supported now
    if(!supabase) return res.status(501).json({ ok:false, error: 'Supabase not configured' });
    const { data, error } = await supabase.auth.getUser(token);
    if(error || !data || !data.user) return res.status(401).json({ ok:false, error: 'Invalid token' });
    req.user = { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.full_name };
    return next();
  }catch(err){
    console.error('verifyAuth error', err && err.message);
    return res.status(401).json({ ok:false, error: 'Invalid token' });
  }
}

// GET user's saved blocks (customization)
app.get('/api/blocks', verifyAuth, async (req, res) => {
  try{
    const userId = req.user.id;
    if(supabase){
      const { data, error } = await supabase.from('user_blocks').select('*').eq('user_id', userId);
      if(error) throw error;
      return res.json({ ok:true, blocks: data });
    }
    const result = await pool.query('SELECT id, block_key, position, style, created_at FROM user_blocks WHERE user_id = $1 ORDER BY id', [userId]);
    return res.json({ ok:true, blocks: result.rows });
  }catch(err){
    console.error(err);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// Replace user's blocks (simple strategy: delete existing and insert new)
app.put('/api/blocks', verifyAuth, async (req, res) => {
  try{
    const userId = req.user.id;
    const { blocks } = req.body;
    if(!Array.isArray(blocks)) return res.status(400).json({ ok:false, error: 'Blocks must be an array' });
    if(!supabase) return res.status(501).json({ ok:false, error: 'Supabase not configured' });
    if(supabase){
      // delete existing
      const { error: delErr } = await supabase.from('user_blocks').delete().eq('user_id', userId);
      if(delErr) throw delErr;
      const toInsert = blocks.map(b => ({ user_id: userId, block_key: b.block_key, position: b.position || {}, style: b.style || {} }));
      const { data, error: insErr } = await supabase.from('user_blocks').insert(toInsert).select();
      if(insErr) throw insErr;
      return res.json({ ok:true, blocks: data });
    }

    const client = await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query('DELETE FROM user_blocks WHERE user_id = $1', [userId]);
      const inserted = [];
      const text = 'INSERT INTO user_blocks (user_id, block_key, position, style, created_at) VALUES ($1,$2,$3,$4,now()) RETURNING id, block_key, position, style';
      for(const b of blocks){
        const vals = [userId, b.block_key, JSON.stringify(b.position || {}), JSON.stringify(b.style || {})];
        const r = await client.query(text, vals);
        inserted.push(r.rows[0]);
      }
      await client.query('COMMIT');
      return res.json({ ok:true, blocks: inserted });
    }catch(e){
      await client.query('ROLLBACK');
      throw e;
    }finally{
      client.release();
    }
  }catch(err){
    console.error(err);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});


// Replace user's flashcards (batch replace). Expects { cards: [...] }
app.put('/api/flashcards', verifyAuth, async (req, res) => {
  try{
    const userId = req.user.id;
    const { cards } = req.body;
    if(!Array.isArray(cards)) return res.status(400).json({ ok:false, error: 'cards must be an array' });
    if(!supabase) return res.status(501).json({ ok:false, error: 'Supabase not configured' });
    // delete existing
    const { error: delErr } = await supabase.from('flashcards').delete().eq('user_id', userId);
    if(delErr) throw delErr;
    const toInsert = cards.map(c => ({
      id: c.id,
      user_id: userId,
      front: c.front || null,
      back: c.back || null,
      tags: c.tags || null,
      metadata: c.metadata || {},
      created_at: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
      updated_at: c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString()
    }));
    const { data, error } = await supabase.from('flashcards').insert(toInsert).select();
    if(error) throw error;
    return res.json({ ok:true, cards: data });
  }catch(err){
    console.error('flashcards PUT error', err);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// Create a single flashcard
app.post('/api/flashcards', verifyAuth, async (req, res) => {
  try{
    const userId = req.user.id;
    const c = req.body;
    if(!c || !c.id) return res.status(400).json({ ok:false, error: 'Missing card body or id' });
    if(!supabase) return res.status(501).json({ ok:false, error: 'Supabase not configured' });
    const toInsert = {
      id: c.id,
      user_id: userId,
      front: c.front || null,
      back: c.back || null,
      tags: c.tags || null,
      metadata: c.metadata || {},
      created_at: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
      updated_at: c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString()
    };
    const { data, error } = await supabase.from('flashcards').insert([toInsert]).select();
    if(error) throw error;
    return res.json({ ok:true, card: data[0] });
  }catch(err){
    console.error('flashcards POST error', err);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// Get single flashcard
app.get('/api/flashcards/:id', verifyAuth, async (req, res) => {
  try{
    const userId = req.user.id;
    const id = req.params.id;
    if(!supabase) return res.status(501).json({ ok:false, error: 'Supabase not configured' });
    const { data, error } = await supabase.from('flashcards').select('*').eq('id', id).eq('user_id', userId).single();
    if(error) return res.status(404).json({ ok:false, error: 'Not found' });
    return res.json({ ok:true, card: data });
  }catch(err){
    console.error('flashcards GET error', err);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// Update single flashcard
app.put('/api/flashcards/:id', verifyAuth, async (req, res) => {
  try{
    const userId = req.user.id;
    const id = req.params.id;
    const c = req.body;
    if(!supabase) return res.status(501).json({ ok:false, error: 'Supabase not configured' });
    const updates = {
      front: c.front || null,
      back: c.back || null,
      tags: c.tags || null,
      metadata: c.metadata || {},
      updated_at: c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString()
    };
    const { data, error } = await supabase.from('flashcards').update(updates).eq('id', id).eq('user_id', userId).select();
    if(error) throw error;
    return res.json({ ok:true, card: data[0] });
  }catch(err){
    console.error('flashcards UPDATE error', err);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// Delete single flashcard
app.delete('/api/flashcards/:id', verifyAuth, async (req, res) => {
  try{
    const userId = req.user.id;
    const id = req.params.id;
    if(!supabase) return res.status(501).json({ ok:false, error: 'Supabase not configured' });
    const { error } = await supabase.from('flashcards').delete().eq('id', id).eq('user_id', userId);
    if(error) throw error;
    return res.json({ ok:true });
  }catch(err){
    console.error('flashcards DELETE error', err);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// Get recent flashcards for the authenticated user
app.get('/api/flashcards/recent', verifyAuth, async (req, res) => {
  try{
    const userId = req.user.id;
    if(!supabase) return res.status(501).json({ ok:false, error: 'Supabase not configured' });
    const { data, error } = await supabase.from('flashcards').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(20);
    if(error) throw error;
    return res.json({ ok:true, cards: data });
  }catch(err){
    console.error('flashcards recent error', err);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// Simple file upload endpoint (accepts JSON { name, contentType, base64 }) and stores in Supabase Storage
app.post('/api/upload', verifyAuth, uploadMiddleware.single('file'), async (req, res) => {
  try{
    if(!supabase) return res.status(501).json({ ok:false, error: 'Supabase not configured' });
    const userId = req.user.id;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'user-files';

    let filename = null;
    let buffer = null;
    let contentType = null;

    // If multipart upload (file field), use buffer
    if(req.file && req.file.buffer){
      const orig = req.file.originalname || 'upload';
      filename = `${userId}/${Date.now()}_${orig}`;
      buffer = req.file.buffer;
      contentType = req.file.mimetype || 'application/octet-stream';
    } else {
      // fallback to JSON body with base64
      const { name, contentType: ct, base64 } = req.body;
      if(!name || !base64) return res.status(400).json({ ok:false, error: 'Missing name or base64 content' });
      filename = `${userId}/${Date.now()}_${name}`;
      buffer = Buffer.from(base64, 'base64');
      contentType = ct || 'application/octet-stream';
    }

    const { data, error } = await supabase.storage.from(bucket).upload(filename, buffer, { contentType, upsert: false });
    if(error){
      console.error('upload error', error);
      return res.status(500).json({ ok:false, error: error.message || error });
    }
    // Retrieve public URL (may require bucket to be public or use signed URL in production)
    const publicRes = await supabase.storage.from(bucket).getPublicUrl(filename);
    const publicUrl = publicRes && publicRes.data ? publicRes.data.publicUrl : null;
    return res.json({ ok:true, path: filename, publicUrl, data });
  }catch(err){
    console.error('upload endpoint error', err);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// Refresh Supabase session using refresh token (server exchanges refresh token for new session)
app.post('/api/auth/refresh', async (req, res) => {
  try{
    if(!supabase) return res.status(501).json({ ok:false, error: 'Supabase not configured' });
    const { refresh_token } = req.body;
    if(!refresh_token) return res.status(400).json({ ok:false, error: 'Missing refresh_token' });
    // Call Supabase token endpoint
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token`;
    const params = new URLSearchParams();
    params.set('grant_type', 'refresh_token');
    params.set('refresh_token', refresh_token);
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'apikey': SUPABASE_KEY
      },
      body: params.toString()
    });
    const data = await r.json();
    if(!r.ok) return res.status(400).json({ ok:false, error: data });
    return res.json({ ok:true, session: data });
  }catch(err){
    console.error('refresh error', err);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
