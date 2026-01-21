const pool = require('../config/database');

class BackupController {
    // Generate Database Dump
    static async createDump(req, res) {
        try {
            console.log('Starting database dump...');
            let dump = '';

            // Add header
            dump += `-- Database Dump\n`;
            dump += `-- Generated: ${new Date().toISOString()}\n\n`;
            dump += `SET FOREIGN_KEY_CHECKS=0;\n\n`;

            // Get all tables
            const [tables] = await pool.query('SHOW TABLES');
            const tableNames = tables.map(t => Object.values(t)[0]);

            for (const table of tableNames) {
                // Get Create Table statement
                const [createResult] = await pool.query(`SHOW CREATE TABLE ${table}`);
                const createSql = createResult[0]['Create Table'];

                dump += `-- Table structure for ${table}\n`;
                dump += `DROP TABLE IF EXISTS ${table};\n`;
                dump += `${createSql};\n\n`;

                // Get Data
                const [rows] = await pool.query(`SELECT * FROM ${table}`);
                if (rows.length > 0) {
                    dump += `-- Dumping data for ${table}\n`;
                    dump += `INSERT INTO ${table} VALUES\n`;

                    const values = rows.map(row => {
                        const rowValues = Object.values(row).map(val => {
                            if (val === null) return 'NULL';
                            if (typeof val === 'number') return val;
                            if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`; // Format YYYY-MM-DD HH:mm:ss
                            // Escape single quotes
                            return `'${String(val).replace(/'/g, "\\'")}'`;
                        });
                        return `(${rowValues.join(', ')})`;
                    });

                    dump += values.join(',\n');
                    dump += `;\n\n`;
                }
            }

            dump += `SET FOREIGN_KEY_CHECKS=1;\n`;

            res.header('Content-Type', 'text/plain');
            res.attachment(`backup_${new Date().toISOString().split('T')[0]}.sql`);
            res.send(dump);

        } catch (err) {
            console.error('Backup error:', err);
            res.status(500).json({ error: 'Backup failed', details: err.message });
        }
    }

    // Restore Database from Dump
    static async restoreDump(req, res) {
        // Expecting raw SQL text in body
        // Ensure body-parser is configured for text in server.js if not already
        const sql = req.body;

        if (!sql || typeof sql !== 'string') {
            return res.status(400).json({ error: 'Invalid SQL dump provided' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Split by semicolon but respect quotes (simple split might fail on content containing semicolons)
            // For robustness, we might need a better splitter, but for now assuming standard dump format
            // A simple approach: split by ";\n" or just execute if the driver supports multiple statements

            // mysql2 supports multiple statements if configured, but pool might not be.
            // Let's try enabling multipleStatements in connection or split manually.
            // Manual split is safer for now.

            const statements = sql
                .split(/;\s*[\r\n]+/) // Split by semicolon at end of line
                .filter(stmt => stmt.trim().length > 0);

            for (const statement of statements) {
                if (statement.trim().startsWith('--')) continue; // Skip comments
                await connection.query(statement);
            }

            await connection.commit();
            res.json({ message: 'Database restored successfully' });

        } catch (err) {
            await connection.rollback();
            console.error('Restore error:', err);
            res.status(500).json({ error: 'Restore failed', details: err.message });
        } finally {
            connection.release();
        }
    }
}

module.exports = BackupController;
