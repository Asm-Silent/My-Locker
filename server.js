const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware Setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

app.use(session({
    secret: 'my-locker-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Database Connection
const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) console.error('Database opening error: ', err.message);
    else console.log('Connected to SQLite database.');
});

// Initialize Tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        role TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT,
        category TEXT,
        description TEXT,
        file_url TEXT,
        is_starred INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT,
        event_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS friendships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        friend_id INTEGER,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(friend_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS shared_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER,
        shared_with_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(file_id) REFERENCES files(id),
        FOREIGN KEY(shared_with_user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER,
        receiver_id INTEGER,
        message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(sender_id) REFERENCES users(id),
        FOREIGN KEY(receiver_id) REFERENCES users(id)
    )`);
});

// Authentication Middleware
function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized. Please log in.' });
}

// --- AUTH ROUTES ---
app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
            [name, email, hashedPassword, 'Student'],
            function(err) {
                if (err) return res.status(400).json({ error: 'Email already exists or invalid.' });
                res.status(201).json({ message: 'Registration successful!' });
            }
        );
    } catch (err) {
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err || !user) return res.status(400).json({ error: 'Invalid email or password.' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: 'Invalid email or password.' });

        req.session.userId = user.id;
        req.session.userName = user.name;
        res.json({ message: 'Login successful!' });
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ message: 'Logged out successfully.' });
    });
});

// --- FILE CRUD ROUTES ---
app.get('/api/files', isAuthenticated, (req, res) => {
    db.all(`SELECT * FROM files WHERE user_id = ? ORDER BY created_at DESC`, [req.session.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to retrieve files.' });
        res.json(rows);
    });
});

app.post('/api/files', isAuthenticated, upload.single('file'), (req, res) => {
    const body = req.body || {};
    const title = body.title || '';
    const category = body.category || 'Document';
    const description = body.description || '';
    let file_url = body.file_url || '';

    if (req.file) {
        file_url = `/uploads/${req.file.filename}`;
    }

    if (!title || !file_url) {
        return res.status(400).json({ error: 'Title and file/URL are required.' });
    }

    db.run(`INSERT INTO files (user_id, title, category, description, file_url) VALUES (?, ?, ?, ?, ?)`,
        [req.session.userId, title, category, description, file_url],
        function(err) {
            if (err) return res.status(500).json({ error: 'Failed to save file record.' });
            res.status(201).json({ message: 'File added successfully!', id: this.lastID });
        }
    );
});

app.patch('/api/files/:id/star', isAuthenticated, (req, res) => {
    const fileId = req.params.id;
    db.get(`SELECT is_starred FROM files WHERE id = ? AND user_id = ?`, [fileId, req.session.userId], (err, file) => {
        if (err || !file) return res.status(404).json({ error: 'File not found.' });
        
        const newStarredState = file.is_starred === 1 ? 0 : 1;
        db.run(`UPDATE files SET is_starred = ? WHERE id = ? AND user_id = ?`, [newStarredState, fileId, req.session.userId], (updateErr) => {
            if (updateErr) return res.status(500).json({ error: 'Failed to update star status.' });
            res.json({ message: 'Star status updated', is_starred: newStarredState });
        });
    });
});

app.delete('/api/files/:id', isAuthenticated, (req, res) => {
    const fileId = req.params.id;
    db.get(`SELECT * FROM files WHERE id = ? AND user_id = ?`, [fileId, req.session.userId], (err, fileRecord) => {
        if (err || !fileRecord) {
            return res.status(404).json({ error: 'File not found or unauthorized.' });
        }

        db.run(`DELETE FROM files WHERE id = ? AND user_id = ?`, [fileId, req.session.userId], (delErr) => {
            if (delErr) return res.status(500).json({ error: 'Failed to delete file.' });
            res.json({ message: 'File deleted successfully!' });
        });
    });
});

// --- NOTE CRUD ROUTES ---
app.get('/api/notes', isAuthenticated, (req, res) => {
    db.all(`SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC`, [req.session.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to retrieve notes.' });
        res.json(rows);
    });
});

app.post('/api/notes', isAuthenticated, (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Note content cannot be empty.' });

    db.run(`INSERT INTO notes (user_id, content) VALUES (?, ?)`,
        [req.session.userId, content],
        function(err) {
            if (err) return res.status(500).json({ error: 'Failed to save note.' });
            res.status(201).json({ message: 'Note added successfully!', id: this.lastID });
        }
    );
});

app.delete('/api/notes/:id', isAuthenticated, (req, res) => {
    const noteId = req.params.id;
    db.run(`DELETE FROM notes WHERE id = ? AND user_id = ?`, [noteId, req.session.userId], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to delete note.' });
        res.json({ message: 'Note deleted successfully!' });
    });
});

// --- CALENDAR EVENT CRUD ROUTES ---
app.get('/api/events', isAuthenticated, (req, res) => {
    db.all(`SELECT * FROM calendar_events WHERE user_id = ?`, [req.session.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to retrieve events.' });
        res.json(rows);
    });
});

app.post('/api/events', isAuthenticated, (req, res) => {
    const { title, event_date } = req.body;
    if (!title || !event_date) return res.status(400).json({ error: 'Title and date are required.' });

    db.run(`INSERT INTO calendar_events (user_id, title, event_date) VALUES (?, ?, ?)`,
        [req.session.userId, title, event_date],
        function(err) {
            if (err) return res.status(500).json({ error: 'Failed to save event.' });
            res.status(201).json({ message: 'Event added successfully!', id: this.lastID });
        }
    );
});

app.delete('/api/events/:id', isAuthenticated, (req, res) => {
    const eventId = req.params.id;
    db.run(`DELETE FROM calendar_events WHERE id = ? AND user_id = ?`, [eventId, req.session.userId], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to delete event.' });
        res.json({ message: 'Event deleted successfully!' });
    });
});

// --- SOCIAL & COLLABORATION ROUTES ---
app.get('/api/users/search', isAuthenticated, (req, res) => {
    const query = req.query.q || '';
    db.all(`SELECT id, name, email FROM users WHERE id != ? AND (name LIKE ? OR email LIKE ?)`,
        [req.session.userId, `%${query}%`, `%${query}%`],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Failed to search users.' });
            res.json(rows);
        }
    );
});

app.get('/api/friends', isAuthenticated, (req, res) => {
    const query = `
        SELECT f.id as friendship_id, u.id as user_id, u.name, u.email, f.status, f.user_id as requester_id
        FROM friendships f
        JOIN users u ON (u.id = f.friend_id OR u.id = f.user_id)
        WHERE (f.user_id = ? OR f.friend_id = ?) AND u.id != ?
    `;
    db.all(query, [req.session.userId, req.session.userId, req.session.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to retrieve friends.' });
        res.json(rows);
    });
});

app.post('/api/friends/request', isAuthenticated, (req, res) => {
    const { friend_id } = req.body;
    if (!friend_id || friend_id == req.session.userId) {
        return res.status(400).json({ error: 'Invalid user ID.' });
    }

    db.run(`INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'pending')`,
        [req.session.userId, friend_id],
        function(err) {
            if (err) return res.status(400).json({ error: 'Friend request already sent or exists.' });
            res.status(201).json({ message: 'Friend request sent!' });
        }
    );
});

app.patch('/api/friends/accept/:id', isAuthenticated, (req, res) => {
    const friendshipId = req.params.id;
    db.run(`UPDATE friendships SET status = 'accepted' WHERE id = ? AND friend_id = ?`,
        [friendshipId, req.session.userId],
        function(err) {
            if (err) return res.status(500).json({ error: 'Failed to accept request.' });
            res.json({ message: 'Friend request accepted!' });
        }
    );
});

app.delete('/api/friends/:id', isAuthenticated, (req, res) => {
    const friendshipId = req.params.id;
    db.run(`DELETE FROM friendships WHERE id = ? AND (user_id = ? OR friend_id = ?)`,
        [friendshipId, req.session.userId, req.session.userId],
        function(err) {
            if (err) return res.status(500).json({ error: 'Failed to unfriend.' });
            res.json({ message: 'Successfully removed friend.' });
        }
    );
});

app.post('/api/files/share', isAuthenticated, (req, res) => {
    const { file_id, friend_id } = req.body;
    if (!file_id || !friend_id) return res.status(400).json({ error: 'File and friend are required.' });

    db.get(`SELECT id FROM files WHERE id = ? AND user_id = ?`, [file_id, req.session.userId], (err, file) => {
        if (err || !file) return res.status(403).json({ error: 'Unauthorized to share this file.' });

        db.run(`INSERT INTO shared_files (file_id, shared_with_user_id) VALUES (?, ?)`,
            [file_id, friend_id],
            function(err) {
                if (err) return res.status(400).json({ error: 'File already shared with this user.' });
                res.status(201).json({ message: 'File shared successfully!' });
            }
        );
    });
});

app.get('/api/files/shared', isAuthenticated, (req, res) => {
    const query = `
        SELECT f.*, u.name as owner_name 
        FROM shared_files sf
        JOIN files f ON f.id = sf.file_id
        JOIN users u ON u.id = f.user_id
        WHERE sf.shared_with_user_id = ?
    `;
    db.all(query, [req.session.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to retrieve shared files.' });
        res.json(rows);
    });
});

// --- CHAT & FILE REQUEST ROUTES ---
app.get('/api/messages/:friendId', isAuthenticated, (req, res) => {
    const friendId = req.params.friendId;
    const query = `
        SELECT * FROM messages 
        WHERE (sender_id = ? AND receiver_id = ?) 
           OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at ASC
    `;
    db.all(query, [req.session.userId, friendId, friendId, req.session.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to retrieve messages.' });
        res.json(rows);
    });
});

app.post('/api/messages', isAuthenticated, (req, res) => {
    const { receiver_id, message } = req.body;
    if (!receiver_id || !message) return res.status(400).json({ error: 'Receiver and message are required.' });

    db.run(`INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)`,
        [req.session.userId, receiver_id, message],
        function(err) {
            if (err) return res.status(500).json({ error: 'Failed to send message.' });
            res.status(201).json({ message: 'Message sent successfully!', id: this.lastID });
        }
    );
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});