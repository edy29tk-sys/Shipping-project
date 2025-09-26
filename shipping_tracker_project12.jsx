# Shipping Tracker — Full Frontend + Minimal Node.js Backend

This project is a small shipping company web app with tracking, simple auth (JWT), JSON file storage, and a React frontend. It is intended as a starting point you can extend.

---

## Project structure

```
shipping-tracker/
├─ server/
│  ├─ package.json
│  ├─ index.js                # Express API + auth
│  ├─ data/
│  │  ├─ users.json
│  │  └─ shipments.json
├─ client/
│  ├─ package.json
│  ├─ index.html
│  ├─ src/
│  │  ├─ main.jsx
│  │  ├─ App.jsx
│  │  └─ components/
│  │     ├─ AuthForm.jsx
│  │     ├─ CreateShipment.jsx
│  │     └─ Tracker.jsx
└─ README.md
```

---

## server/package.json

```json
{
  "name": "shipping-tracker-server",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "bcrypt": "^5.1.0",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.0",
    "lowdb": "^5.0.0",
    "nanoid": "^4.0.0"
  },
  "devDependencies": {
    "nodemon": "^2.0.22"
  }
}
```

---

## server/index.js

```js
// Minimal Express API with JSON file storage (lowdb), JWT auth, and shipment tracking
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const { nanoid } = require('nanoid');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'please-change-this-secret';

// Use lowdb for simple JSON storage
const file = path.join(__dirname, 'data', 'db.json');
const adapter = new JSONFile(file);
const db = new Low(adapter);

async function initDB() {
  await db.read();
  db.data ||= { users: [], shipments: [] };
  await db.write();
}

initDB();

// Helpers
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing auth' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Auth routes
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email & password required' });
  await db.read();
  const exists = db.data.users.find(u => u.email === email.toLowerCase());
  if (exists) return res.status(400).json({ error: 'User exists' });
  const hash = await bcrypt.hash(password, 10);
  const user = { id: nanoid(), name: name || '', email: email.toLowerCase(), password: hash };
  db.data.users.push(user);
  await db.write();
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email & password required' });
  await db.read();
  const user = db.data.users.find(u => u.email === email.toLowerCase());
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// Create a shipment (authenticated)
app.post('/api/shipments', authMiddleware, async (req, res) => {
  const { toName, toAddress, weight, service } = req.body;
  if (!toName || !toAddress) return res.status(400).json({ error: 'toName & toAddress required' });
  await db.read();
  const tracking = nanoid(10).toUpperCase();
  const shipment = {
    id: nanoid(),
    tracking,
    createdAt: new Date().toISOString(),
    status: 'Label Created',
    service: service || 'Ground',
    weight: weight || '0.0',
    toName,
    toAddress,
    history: [ { status: 'Label Created', at: new Date().toISOString() } ],
    owner: req.user.id
  };
  db.data.shipments.push(shipment);
  await db.write();
  res.json({ shipment });
});

// Get shipment by tracking (public)
app.get('/api/shipments/:tracking', async (req, res) => {
  const { tracking } = req.params;
  await db.read();
  const s = db.data.shipments.find(x => x.tracking === tracking.toUpperCase());
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json({ shipment: s });
});

// List shipments for user (authenticated)
app.get('/api/my-shipments', authMiddleware, async (req, res) => {
  await db.read();
  const list = db.data.shipments.filter(s => s.owner === req.user.id);
  res.json({ shipments: list });
});

// Simple endpoint to advance status (for demo)
app.post('/api/shipments/:tracking/advance', async (req, res) => {
  const { tracking } = req.params;
  await db.read();
  const s = db.data.shipments.find(x => x.tracking === tracking.toUpperCase());
  if (!s) return res.status(404).json({ error: 'Not found' });
  const nextStatuses = ['Label Created', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered'];
  const curIndex = nextStatuses.indexOf(s.status);
  const next = nextStatuses[Math.min(curIndex + 1, nextStatuses.length - 1)];
  s.status = next;
  s.history.push({ status: next, at: new Date().toISOString() });
  await db.write();
  res.json({ shipment: s });
});

// start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```


---

## server/data/db.json (initial)

```json
{
  "users": [],
  "shipments": []
}
```

---

## client/package.json (Vite + React)

```json
{
  "name": "shipping-tracker-client",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.4.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.14.1"
  },
  "devDependencies": {
    "vite": "^5.0.0"
  }
}
```

---

## client/index.html

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hands of Hope Shipping — Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

---

## client/src/main.jsx

```jsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css' // optional

createRoot(document.getElementById('root')).render(<App />)
```

---

## client/src/App.jsx

```jsx
import React, { useState, useEffect } from 'react'
import AuthForm from './components/AuthForm'
import CreateShipment from './components/CreateShipment'
import Tracker from './components/Tracker'

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

export default function App(){
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'))

  useEffect(()=>{
    if(token) localStorage.setItem('token', token); else localStorage.removeItem('token')
    if(user) localStorage.setItem('user', JSON.stringify(user)); else localStorage.removeItem('user')
  },[token,user])

  return (
    <div style={{fontFamily:'system-ui, sans-serif', padding:20, maxWidth:900, margin:'0 auto'}}>
      <header>
        <h1>Hands of Hope Shipping — Tracker</h1>
        <p>Simple demo: create shipments and track with a tracking code.</p>
      </header>

      {!token ? (
        <AuthForm setToken={setToken} setUser={setUser} api={API} />
      ) : (
        <div>
          <div style={{display:'flex', gap:12, alignItems:'center'}}>
            <strong>{user?.name || user?.email}</strong>
            <button onClick={()=>{ setToken(null); setUser(null); }}>Log out</button>
          </div>
          <CreateShipment token={token} api={API} />
        </div>
      )}

      <hr style={{margin:'20px 0'}} />

      <Tracker api={API} />

    </div>
  )
}
```

---

## client/src/components/AuthForm.jsx

```jsx
import React, { useState } from 'react'
import axios from 'axios'

export default function AuthForm({ setToken, setUser, api }){
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')

  async function submit(e){
    e.preventDefault(); setErr('')
    try{
      const url = `${api}/${mode === 'login' ? 'login' : 'register'}`
      const res = await axios.post(url, mode === 'login' ? { email, password } : { name, email, password })
      setToken(res.data.token)
      setUser(res.data.user)
    }catch(err){
      setErr(err.response?.data?.error || 'Something went wrong')
    }
  }

  return (
    <div style={{border:'1px solid #ddd', padding:16, borderRadius:8}}>
      <h3>{mode === 'login' ? 'Log in' : 'Register'}</h3>
      <form onSubmit={submit}>
        {mode === 'register' && (
          <div><label>Name</label><br /><input value={name} onChange={e=>setName(e.target.value)} /></div>
        )}
        <div><label>Email</label><br /><input value={email} onChange={e=>setEmail(e.target.value)} type="email" /></div>
        <div><label>Password</label><br /><input value={password} onChange={e=>setPassword(e.target.value)} type="password" /></div>
        <div style={{marginTop:8}}>
          <button type="submit">{mode === 'login' ? 'Log in' : 'Register'}</button>
          <button type="button" onClick={()=>setMode(mode === 'login' ? 'register' : 'login')} style={{marginLeft:8}}>
            {mode === 'login' ? 'Create account' : 'Have an account? Log in'}
          </button>
        </div>
        {err && <p style={{color:'red'}}>{err}</p>}
      </form>
    </div>
  )
}
```

---

## client/src/components/CreateShipment.jsx

```jsx
import React, { useState } from 'react'
import axios from 'axios'

export default function CreateShipment({ token, api }){
  const [toName, setToName] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [weight, setWeight] = useState('')
  const [service, setService] = useState('Ground')
  const [created, setCreated] = useState(null)

  async function submit(e){
    e.preventDefault()
    try{
      const res = await axios.post(`${api}/shipments`, { toName, toAddress, weight, service }, { headers: { Authorization: `Bearer ${token}` } })
      setCreated(res.data.shipment)
    }catch(err){
      alert(err.response?.data?.error || err.message)
    }
  }

  return (
    <div style={{border:'1px solid #eee', padding:12, borderRadius:8, marginTop:12}}>
      <h4>Create shipment</h4>
      <form onSubmit={submit}>
        <div><label>Recipient name</label><br /><input value={toName} onChange={e=>setToName(e.target.value)} /></div>
        <div><label>Address</label><br /><input value={toAddress} onChange={e=>setToAddress(e.target.value)} /></div>
        <div><label>Weight</label><br /><input value={weight} onChange={e=>setWeight(e.target.value)} /></div>
        <div><label>Service</label><br /><select value={service} onChange={e=>setService(e.target.value)}><option>Ground</option><option>Express</option></select></div>
        <div style={{marginTop:8}}><button type="submit">Create</button></div>
      </form>

      {created && (
        <div style={{marginTop:12, padding:8, background:'#f9f9f9'}}>
          <strong>Created!</strong>
          <div>Tracking: <code>{created.tracking}</code></div>
          <div>Status: {created.status}</div>
        </div>
      )}
    </div>
  )
}
```

---

## client/src/components/Tracker.jsx

```jsx
import React, { useState } from 'react'
import axios from 'axios'

export default function Tracker({ api }){
  const [tracking, setTracking] = useState('')
  const [shipment, setShipment] = useState(null)
  const [err, setErr] = useState('')

  async function lookup(e){
    e.preventDefault(); setErr(''); setShipment(null)
    try{
      const res = await axios.get(`${api}/shipments/${tracking}`)
      setShipment(res.data.shipment)
    }catch(err){
      setErr(err.response?.data?.error || 'Not found')
    }
  }

  return (
    <div style={{marginTop:20}}>
      <h3>Track a package</h3>
      <form onSubmit={lookup}>
        <input value={tracking} onChange={e=>setTracking(e.target.value.toUpperCase())} placeholder="Enter tracking code" />
        <button type="submit">Track</button>
      </form>

      {err && <p style={{color:'red'}}>{err}</p>}

      {shipment && (
        <div style={{border:'1px solid #eee', marginTop:12, padding:12}}>
          <h4>Tracking: {shipment.tracking}</h4>
          <p>Status: {shipment.status}</p>
          <p>Service: {shipment.service} | Weight: {shipment.weight}</p>
          <h5>History</h5>
          <ul>
            {shipment.history.map((h, i)=> (<li key={i}>{h.status} — {new Date(h.at).toLocaleString()}</li>))}
          </ul>
          <p>To: {shipment.toName} — {shipment.toAddress}</p>
        </div>
      )}
    </div>
  )
}
```

---

## client/src/styles.css (optional)

```css
body { background: #f6f8fb; color: #111 }
input, select, button { padding:8px; margin-top:6px }
button { cursor:pointer }
code { background:#fff; padding:4px 6px; border-radius:4px }
```

---

## How to run

1. Clone the project.
2. Start the server:
   - `cd server`
   - `npm install`
   - set environment variable `JWT_SECRET` (optional). Example: `export JWT_SECRET="your-secret"` on mac/linux or use a .env loader.
   - `npm run dev`
3. Start the client:
   - `cd client`
   - `npm install`
   - `npm run dev`
4. Open the frontend (usually http://localhost:5173) and point it at the server (http://localhost:4000).


---

## Notes & Next steps
- This is a demo. For production, replace JSON file storage with a proper DB (Postgres, MongoDB), secure secrets, add input validation, rate limiting, HTTPS.
- Add admin UI, printing labels, shipment rates, webhooks, carriers integrations (e.g., UPS/FedEx API), and email/SMS updates.

---

Happy to customize the UI branding (colors, logo, copy) or add features (shipment PDF labels, CSV export, webhook simulator).
