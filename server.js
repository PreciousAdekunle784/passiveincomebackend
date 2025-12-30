const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize SQLite Database
const db = new sqlite3.Database('./questionnaire_responses.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Create tables if they don't exist
function initializeDatabase() {
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
            console.error('Error creating table:', err.message);
        } else {
            console.log('Database table ready');
        }
    });
}

// API Endpoints

// 1. Submit questionnaire response
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

    // Get client info
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    // Validate required fields
    if (!firstName || !email) {
        return res.status(400).json({
            success: false,
            message: 'First name and email are required'
        });
    }

    // Insert into database
    const sql = `
        INSERT INTO responses (
            first_name, email, question_1, question_2, question_3, 
            question_4, question_5, ip_address, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            console.error('Error inserting data:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to save response'
            });
        }

        res.json({
            success: true,
            message: 'Response saved successfully',
            responseId: this.lastID
        });
    });
});

// 2. Get all responses (for admin dashboard)
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
            console.error('Error fetching responses:', err.message);
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

// 3. Get single response by ID
app.get('/api/responses/:id', (req, res) => {
    const { id } = req.params;

    const sql = `
        SELECT * FROM responses WHERE id = ?
    `;

    db.get(sql, [id], (err, row) => {
        if (err) {
            console.error('Error fetching response:', err.message);
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

// 4. Get response count
app.get('/api/stats', (req, res) => {
    const sql = `
        SELECT 
            COUNT(*) as total_responses,
            COUNT(DISTINCT email) as unique_emails,
            DATE(submitted_at) as date,
            COUNT(*) as daily_count
        FROM responses
        GROUP BY DATE(submitted_at)
        ORDER BY date DESC
        LIMIT 30
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Error fetching stats:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch stats'
            });
        }

        // Get total count
        db.get('SELECT COUNT(*) as total FROM responses', [], (err, total) => {
            res.json({
                success: true,
                totalResponses: total.total,
                dailyBreakdown: rows
            });
        });
    });
});

// 5. Delete response (admin only)
app.delete('/api/responses/:id', (req, res) => {
    const { id } = req.params;

    const sql = 'DELETE FROM responses WHERE id = ?';

    db.run(sql, [id], function(err) {
        if (err) {
            console.error('Error deleting response:', err.message);
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

        res.json({
            success: true,
            message: 'Response deleted successfully'
        });
    });
});

// 6. Search responses
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

    const searchTerm = `%${query}%`;

    db.all(sql, [searchTerm, searchTerm], (err, rows) => {
        if (err) {
            console.error('Error searching:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Search failed'
            });
        }

        res.json({
            success: true,
            count: rows.length,
            results: rows
        });
    });
});

// 7. Export to CSV
app.get('/api/export/csv', (req, res) => {
    const sql = 'SELECT * FROM responses ORDER BY submitted_at DESC';

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Error exporting:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Export failed'
            });
        }

        // Create CSV
        let csv = 'ID,First Name,Email,Question 1,Question 2,Question 3,Question 4,Question 5,Submitted At,IP Address\n';
        
        rows.forEach(row => {
            csv += `${row.id},"${row.first_name}","${row.email}","${row.question_1 || ''}","${row.question_2 || ''}","${row.question_3 || ''}","${row.question_4 || ''}","${row.question_5 || ''}","${row.submitted_at}","${row.ip_address}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=questionnaire_responses.csv');
        res.send(csv);
    });
});

// Serve admin dashboard
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed');
        }
        process.exit(0);
    });
});
