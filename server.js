// ===================================
// PASSIVE INCOME PLAYBOOK - BACKEND SERVER
// Complete Node.js + SQLite Backend System
// ===================================

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ===================================
// MIDDLEWARE CONFIGURATION
// ===================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ===================================
// DATABASE SETUP (SQLite)
// ===================================

const db = new sqlite3.Database('./questionnaire_responses.db', (err) => {
    if (err) {
        console.error('❌ Database connection error:', err.message);
    } else {
        console.log('✅ Connected to SQLite database');
    }
});

// Create table if it doesn't exist
db.run(`
    CREATE TABLE IF NOT EXISTS responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        email TEXT NOT NULL,
        question_1 TEXT,
        question_2 TEXT,
        question_3 TEXT,
        question_4 TEXT,
        question_5 TEXT,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT,
        user_agent TEXT
    )
`, (err) => {
    if (err) {
        console.error('❌ Table creation error:', err.message);
    } else {
        console.log('✅ Database table ready');
    }
});

// ===================================
// API ENDPOINTS
// ===================================

// 1. SUBMIT QUESTIONNAIRE RESPONSE
app.post('/api/submit-questionnaire', (req, res) => {
    const {
        firstName,
        email,
        question1,
        question2,
        question3,
        question4,
        question5
    } = req.body;

    // Get IP address and user agent
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Validate required fields
    if (!firstName || !email) {
        return res.status(400).json({
            success: false,
            message: 'First name and email are required'
        });
    }

    // Insert into database
    const sql = `
        INSERT INTO responses 
        (first_name, email, question_1, question_2, question_3, question_4, question_5, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [
        firstName,
        email,
        question1 || null,
        question2 || null,
        question3 || null,
        question4 || null,
        question5 || null,
        ipAddress,
        userAgent
    ], function(err) {
        if (err) {
            console.error('❌ Insert error:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to save response'
            });
        }

        console.log(`✅ New response saved - ID: ${this.lastID}`);
        res.json({
            success: true,
            responseId: this.lastID,
            message: 'Response saved successfully'
        });
    });
});

// 2. GET ALL RESPONSES
app.get('/api/responses', (req, res) => {
    const sql = `
        SELECT 
            id,
            first_name,
            email,
            question_1,
            question_2,
            question_3,
            question_4,
            question_5,
            submitted_at,
            ip_address
        FROM responses
        ORDER BY submitted_at DESC
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('❌ Query error:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch responses'
            });
        }

        res.json({
            success: true,
            count: rows.length,
            responses: rows
        });
    });
});

// 3. GET SINGLE RESPONSE BY ID
app.get('/api/responses/:id', (req, res) => {
    const { id } = req.params;

    const sql = `
        SELECT * FROM responses WHERE id = ?
    `;

    db.get(sql, [id], (err, row) => {
        if (err) {
            console.error('❌ Query error:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch response'
            });
        }

        if (!row) {
            return res.status(404).json({
                success: false,
                message: 'Response not found'
            });
        }

        res.json({
            success: true,
            response: row
        });
    });
});

// 4. GET STATISTICS
app.get('/api/stats', (req, res) => {
    const queries = {
        total: 'SELECT COUNT(*) as count FROM responses',
        today: `SELECT COUNT(*) as count FROM responses 
                WHERE DATE(submitted_at) = DATE('now')`,
        uniqueEmails: 'SELECT COUNT(DISTINCT email) as count FROM responses'
    };

    const stats = {};
    let completed = 0;

    Object.keys(queries).forEach(key => {
        db.get(queries[key], [], (err, row) => {
            if (!err) {
                stats[key] = row.count;
            }
            completed++;

            if (completed === Object.keys(queries).length) {
                res.json({
                    success: true,
                    stats: stats
                });
            }
        });
    });
});

// 5. DELETE RESPONSE
app.delete('/api/responses/:id', (req, res) => {
    const { id } = req.params;

    const sql = 'DELETE FROM responses WHERE id = ?';

    db.run(sql, [id], function(err) {
        if (err) {
            console.error('❌ Delete error:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to delete response'
            });
        }

        if (this.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'Response not found'
            });
        }

        console.log(`✅ Response deleted - ID: ${id}`);
        res.json({
            success: true,
            message: 'Response deleted successfully'
        });
    });
});

// 6. SEARCH RESPONSES
app.get('/api/search', (req, res) => {
    const { query } = req.query;

    if (!query) {
        return res.status(400).json({
            success: false,
            message: 'Search query is required'
        });
    }

    const sql = `
        SELECT * FROM responses
        WHERE first_name LIKE ? OR email LIKE ?
        ORDER BY submitted_at DESC
    `;

    const searchPattern = `%${query}%`;

    db.all(sql, [searchPattern, searchPattern], (err, rows) => {
        if (err) {
            console.error('❌ Search error:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Search failed'
            });
        }

        res.json({
            success: true,
            count: rows.length,
            responses: rows
        });
    });
});

// 7. EXPORT TO CSV
app.get('/api/export/csv', (req, res) => {
    const sql = 'SELECT * FROM responses ORDER BY submitted_at DESC';

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('❌ Export error:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Export failed'
            });
        }

        // Generate CSV
        let csv = 'ID,First Name,Email,Question 1,Question 2,Question 3,Question 4,Question 5,Submitted At,IP Address\n';

        rows.forEach(row => {
            csv += `${row.id},"${row.first_name}","${row.email}","${row.question_1 || ''}","${row.question_2 || ''}","${row.question_3 || ''}","${row.question_4 || ''}","${row.question_5 || ''}","${row.submitted_at}","${row.ip_address}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=responses.csv');
        res.send(csv);
    });
});

// ===================================
// SERVE ADMIN DASHBOARD
// ===================================

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

// ===================================
// ROOT ENDPOINT
// ===================================

app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Passive Income Playbook API Server',
        version: '1.0.0',
        endpoints: {
            submit: 'POST /api/submit-questionnaire',
            getAll: 'GET /api/responses',
            getOne: 'GET /api/responses/:id',
            stats: 'GET /api/stats',
            delete: 'DELETE /api/responses/:id',
            search: 'GET /api/search?query=name',
            export: 'GET /api/export/csv',
            admin: 'GET /admin'
        }
    });
});

// ===================================
// ERROR HANDLING
// ===================================

app.use((err, req, res, next) => {
    console.error('❌ Server error:', err.stack);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// ===================================
// START SERVER
// ===================================

app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 ================================');
    console.log('   PASSIVE INCOME PLAYBOOK SERVER');
    console.log('   ================================');
    console.log(`\n✅ Server running on port ${PORT}`);
    console.log(`✅ Admin dashboard available at /admin`);
    console.log(`✅ API endpoint available at /api\n`);
});

// ===================================
// GRACEFUL SHUTDOWN
// ===================================

process.on('SIGINT', () => {
    console.log('\n\n⚠️  Shutting down server...');
    db.close((err) => {
        if (err) {
            console.error('❌ Error closing database:', err.message);
        } else {
            console.log('✅ Database connection closed');
        }
        process.exit(0);
    });
});
