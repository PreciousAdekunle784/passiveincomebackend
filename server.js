// ===================================
// PASSIVE INCOME PLAYBOOK - BACKEND SERVER
// Simplified version with embedded admin dashboard
// ===================================

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ===================================
// MIDDLEWARE CONFIGURATION
// ===================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
        console.error('❌ Error creating table:', err.message);
    } else {
        console.log('✅ Database table ready');
    }
});

// ===================================
// API ENDPOINTS
// ===================================

// Submit questionnaire response
app.post('/api/submit-questionnaire', (req, res) => {
    const { firstName, email, question1, question2, question3, question4, question5 } = req.body;

    if (!firstName || !email) {
        return res.status(400).json({
            success: false,
            message: 'First name and email are required'
        });
    }

    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    const sql = `INSERT INTO responses (first_name, email, question_1, question_2, question_3, question_4, question_5, ip_address, user_agent)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.run(sql, [firstName, email, question1, question2, question3, question4, question5, ip, userAgent], function(err) {
        if (err) {
            console.error('❌ Database insert error:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to save response'
            });
        }

        console.log(`✅ New response saved! ID: ${this.lastID}`);
        res.json({
            success: true,
            message: 'Response saved successfully',
            responseId: this.lastID
        });
    });
});

// Get all responses
app.get('/api/responses', (req, res) => {
    const sql = 'SELECT * FROM responses ORDER BY submitted_at DESC';

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('❌ Database query error:', err.message);
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

// Get single response
app.get('/api/responses/:id', (req, res) => {
    const sql = 'SELECT * FROM responses WHERE id = ?';

    db.get(sql, [req.params.id], (err, row) => {
        if (err) {
            console.error('❌ Database query error:', err.message);
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

// Get statistics
app.get('/api/stats', (req, res) => {
    const queries = {
        total: 'SELECT COUNT(*) as count FROM responses',
        today: `SELECT COUNT(*) as count FROM responses WHERE DATE(submitted_at) = DATE('now')`,
        unique: 'SELECT COUNT(DISTINCT email) as count FROM responses'
    };

    db.get(queries.total, [], (err, totalResult) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        db.get(queries.today, [], (err, todayResult) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Database error' });
            }

            db.get(queries.unique, [], (err, uniqueResult) => {
                if (err) {
                    return res.status(500).json({ success: false, message: 'Database error' });
                }

                res.json({
                    success: true,
                    stats: {
                        totalResponses: totalResult.count,
                        todayResponses: todayResult.count,
                        uniqueEmails: uniqueResult.count
                    }
                });
            });
        });
    });
});

// Delete response
app.delete('/api/responses/:id', (req, res) => {
    const sql = 'DELETE FROM responses WHERE id = ?';

    db.run(sql, [req.params.id], function(err) {
        if (err) {
            console.error('❌ Database delete error:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to delete response'
            });
        }

        res.json({
            success: true,
            message: 'Response deleted successfully'
        });
    });
});

// Search responses
app.get('/api/search', (req, res) => {
    const query = req.query.query || '';
    const sql = `SELECT * FROM responses 
                 WHERE first_name LIKE ? OR email LIKE ? 
                 ORDER BY submitted_at DESC`;

    db.all(sql, [`%${query}%`, `%${query}%`], (err, rows) => {
        if (err) {
            console.error('❌ Database search error:', err.message);
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

// Export to CSV
app.get('/api/export/csv', (req, res) => {
    const sql = 'SELECT * FROM responses ORDER BY submitted_at DESC';

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('❌ Database export error:', err.message);
            return res.status(500).send('Export failed');
        }

        let csv = 'ID,First Name,Email,Question 1,Question 2,Question 3,Question 4,Question 5,Submitted At,IP Address,User Agent\n';

        rows.forEach(row => {
            csv += `${row.id},"${row.first_name}","${row.email}","${row.question_1 || ''}","${row.question_2 || ''}","${row.question_3 || ''}","${row.question_4 || ''}","${row.question_5 || ''}","${row.submitted_at}","${row.ip_address || ''}","${row.user_agent || ''}"\n`;
        });

        res.header('Content-Type', 'text/csv');
        res.header('Content-Disposition', 'attachment; filename="responses.csv"');
        res.send(csv);
    });
});

// ===================================
// ADMIN DASHBOARD (Check if file exists, otherwise show test page)
// ===================================

app.get('/admin', (req, res) => {
    const adminPath = path.join(__dirname, 'admin-dashboard.html');
    
    // Check if file exists
    if (fs.existsSync(adminPath)) {
        res.sendFile(adminPath);
    } else {
        // File doesn't exist, show diagnostic page
        const files = fs.readdirSync(__dirname);
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Admin Dashboard - File Check</title>
                <style>
                    body { 
                        background: #0a0e1a; 
                        color: #fff; 
                        font-family: 'Courier New', monospace; 
                        padding: 40px;
                        line-height: 1.6;
                    }
                    h1 { color: #ef4444; }
                    h2 { color: #3b82f6; margin-top: 30px; }
                    pre { 
                        background: #1a1f2e; 
                        padding: 20px; 
                        border-radius: 8px;
                        border-left: 4px solid #3b82f6;
                        overflow-x: auto;
                    }
                    .success { color: #10b981; }
                    .error { color: #ef4444; }
                    .info { color: #f59e0b; }
                </style>
            </head>
            <body>
                <h1>⚠️ Admin Dashboard File Not Found</h1>
                <p class="error">The file <code>admin-dashboard.html</code> is missing from the server.</p>
                
                <h2>📂 Files in Current Directory:</h2>
                <pre>${files.join('\n')}</pre>
                
                <h2>📍 Current Directory Path:</h2>
                <pre>${__dirname}</pre>
                
                <h2>✅ Server Status:</h2>
                <p class="success">✓ Server is running correctly</p>
                <p class="success">✓ API endpoints are working</p>
                <p class="error">✗ admin-dashboard.html needs to be uploaded to GitHub</p>
                
                <h2>🔧 How to Fix:</h2>
                <ol>
                    <li>Download <code>admin-dashboard.html</code> from your files</li>
                    <li>Go to your GitHub repository</li>
                    <li>Click "Add file" → "Upload files"</li>
                    <li>Upload <code>admin-dashboard.html</code></li>
                    <li>Commit changes</li>
                    <li>Wait 2 minutes for auto-redeploy</li>
                    <li>Refresh this page</li>
                </ol>
                
                <h2>🧪 Test API Endpoint:</h2>
                <p><a href="/api/stats" style="color: #3b82f6;">Click here to test /api/stats</a></p>
            </body>
            </html>
        `);
    }
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
            admin: 'GET /admin',
            api: 'GET /api',
            submitQuestionnaire: 'POST /api/submit-questionnaire',
            getResponses: 'GET /api/responses',
            getResponse: 'GET /api/responses/:id',
            getStats: 'GET /api/stats',
            deleteResponse: 'DELETE /api/responses/:id',
            search: 'GET /api/search?query=term',
            exportCSV: 'GET /api/export/csv'
        }
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
