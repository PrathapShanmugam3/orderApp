const pdf = require('pdf-parse');
const csv = require('csv-parser');
const fs = require('fs');
const { Readable } = require('stream');
const crypto = require('crypto');
const ExpenseModel = require('../models/expenseModel');

const parseCsv = async (buffer) => {
    const results = [];
    const stream = Readable.from(buffer.toString());

    return new Promise((resolve, reject) => {
        stream
            .pipe(csv({ headers: false })) // Treat as raw rows
            .on('data', (data) => {
                // csv-parser with headers:false returns object {0: 'a', 1: 'b'}
                results.push(Object.values(data));
            })
            .on('end', () => {
                console.log(`[StatementController] Parsed ${results.length} CSV rows`);
                resolve(parseCsvRows(results));
            })
            .on('error', (err) => {
                console.error("CSV Parse Error:", err);
                reject(err);
            });
    });
};

// Helper to parse date string
const parseDate = (dateStr) => {
    if (!dateStr) return null;
    dateStr = dateStr.trim();

    // Handle dd/MM/yyyy HH:mm:ss (Common in CSVs)
    // Remove time part if present
    if (dateStr.includes(' ')) {
        // Check if it's "d MMM yyyy" or "dd/MM/yyyy HH:mm"
        if (dateStr.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
            dateStr = dateStr.split(' ')[0];
        }
    }

    dateStr = dateStr.replace(/[./]/g, '-');

    // Try ISO first
    let d = new Date(dateStr);
    if (!isNaN(d.getTime()) && dateStr.includes('-') && dateStr.length >= 10) return d;

    // Try d MMM yyyy (e.g., 2 Sep 2023) or d MMM, yyyy
    let match = dateStr.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
    if (match) {
        const day = parseInt(match[1]);
        const monthStr = match[2].toLowerCase().substring(0, 3);
        const year = parseInt(match[3]);
        const months = { 'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11 };
        if (months[monthStr] !== undefined) return new Date(year, months[monthStr], day);
    }

    // Try MMM dd, yyyy (e.g., Jan 10, 2026)
    match = dateStr.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (match) {
        const monthStr = match[1].toLowerCase().substring(0, 3);
        const day = parseInt(match[2]);
        const year = parseInt(match[3]);
        const months = { 'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11 };
        if (months[monthStr] !== undefined) return new Date(year, months[monthStr], day);
    }

    // Try dd MMM (e.g. 19 Jan) - Missing Year - Smart year inference
    match = dateStr.match(/^(\d{1,2})\s+([A-Za-z]+)$/);
    if (match) {
        const day = parseInt(match[1]);
        const monthStr = match[2].toLowerCase().substring(0, 3);
        const months = { 'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11 };

        if (months[monthStr] !== undefined) {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();
            const parsedMonth = months[monthStr];

            // If the parsed month is more than 2 months in the future, assume it's from last year
            // E.g., if current is Jan 2026 and date says "Dec", it's likely Dec 2025
            let year = currentYear;
            if (parsedMonth > currentMonth + 2) {
                year = currentYear - 1;
            }

            return new Date(year, parsedMonth, day);
        }
    }

    // Try dd-MM-yyyy
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        let p1 = parseInt(parts[0]);
        let p2 = parseInt(parts[1]);
        let p3 = parseInt(parts[2]);

        // Handle 2-digit years? No, usually 4.
        // But sometimes p3 is time? No we stripped time.

        if (p3 < 100) p3 += 2000;

        // Guess format: dd-mm-yyyy vs mm-dd-yyyy
        // If p1 > 12, it must be day.
        if (p1 > 12) return new Date(p3, p2 - 1, p1); // dd-mm-yyyy

        // If p2 > 12, it must be day.
        if (p2 > 12) return new Date(p3, p1 - 1, p2); // mm-dd-yyyy

        // Ambiguous: Default to dd-mm-yyyy (common in India)
        return new Date(p3, p2 - 1, p1);
    }

    return null;
};

const extractPayeeName = (fullText, fallback) => {
    // Look for text before the amount
    const amountRegex = /(?:₹|Rs\.?|INR|INR\s)\s*([\d,]+(?:\.\d{1,2})?)/;
    const match = fullText.match(amountRegex);
    if (match) {
        const preAmount = fullText.substring(0, match.index).trim();
        const lines = preAmount.split('\n');
        if (lines.length > 0) {
            const candidate = lines[lines.length - 1].trim();
            if (!candidate.includes("Date") && !candidate.includes("Time") && candidate.length > 2) {
                return candidate;
            }
        }
    }
    return fallback;
};

const parsePdf = async (buffer) => {
    try {
        const data = await pdf(buffer);
        const text = data.text;
        const lines = text.split('\n');

        console.log('[StatementController] PDF text extracted, using unified parser...');
        const expenses = [];

        // Unified regex approach matching the Python reference
        // Date patterns: DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY, etc.
        const dateRegex = /(\d{2}[/-]\d{2}[/-]\d{4}|\d{2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})/i;

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.length < 10) continue;

            const dateMatch = trimmedLine.match(dateRegex);
            if (dateMatch) {
                // Found a line with a date. Now look for amount.
                // Strategy: Split line, look for numbers.
                const parts = trimmedLine.split(/\s+/);
                const potentialAmounts = [];
                const descriptionParts = [];

                // Check for Credit indicators
                if (trimmedLine.includes('Cr') || trimmedLine.includes('Credit')) {
                    continue; // Skip credits
                }

                for (const part of parts) {
                    // Clean part to check if number
                    const cleanPart = part.replace(/,/g, '');
                    const val = parseFloat(cleanPart);

                    if (!isNaN(val) && isFinite(val)) {
                        // Filter out years (simple heuristic: if it looks like the year in the date, skip?)
                        // But for now, just collect floats.
                        potentialAmounts.push(val);
                    } else {
                        // Not a number, add to description if it's not the date string itself
                        // (Simple check: part is not exactly the date match)
                        if (!dateMatch[0].includes(part)) {
                            descriptionParts.push(part);
                        }
                    }
                }

                let amount = 0.0;
                if (potentialAmounts.length > 0) {
                    // Heuristic: Take the last number as the amount
                    amount = potentialAmounts[potentialAmounts.length - 1];
                }

                if (amount > 0) {
                    const dateStr = dateMatch[0];
                    const date = parseDate(dateStr);

                    if (date) {
                        const notes = descriptionParts.join(' ').trim();
                        // Clean notes
                        const cleanNotes = notes.replace(/[^a-zA-Z0-9\s]/g, '').trim();

                        expenses.push({
                            date: date.toISOString(),
                            amount: amount,
                            category: 'Uncategorized',
                            description: cleanNotes || 'Expense',
                            notes: cleanNotes || 'Expense'
                        });
                    }
                }
            }
        }

        return expenses;
    } catch (error) {
        console.error("PDF Parse Error:", error);
        return [];
    }
};



const parseCsvRows = (rows) => {
    let expenses = [];
    if (rows.length === 0) return [];

    // Normalize headers
    let headers = rows[0].map(h => h.toLowerCase().trim());
    // If first row doesn't look like headers, try to find them?
    // The Python code assumes headers are available or normalized.
    // csv-parser with headers:false returns rows as arrays, so rows[0] is the first line.
    // We need to identify which row is the header.

    let headerIndex = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
        const rowStr = rows[i].map(e => e.toLowerCase().trim());
        if (rowStr.some(c => c.includes('date') || c.includes('dt'))) {
            headerIndex = i;
            headers = rowStr;
            break;
        }
    }

    if (headerIndex === -1) return [];

    console.log(`[StatementController] Found headers at index ${headerIndex}:`, headers);

    for (let i = headerIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length === 0) continue;

        let date = null;
        let amount = 0;
        let description = "Expense";
        let isCredit = false;
        let txnId = null;

        // Column mapping heuristics
        for (let j = 0; j < headers.length; j++) {
            const col = headers[j];
            const val = row[j] ? row[j].trim() : '';
            if (!val) continue;

            // Date detection
            if (col.includes('date')) {
                const d = parseDate(val);
                if (d) date = d;
            }

            // Description detection
            if (['description', 'narration', 'particulars', 'remark', 'details'].some(k => col.includes(k))) {
                description = val;
            }

            // Transaction ID detection
            if (['txn', 'ref', 'id', 'cheque', 'utr'].some(k => col.includes(k)) && !txnId) {
                txnId = val;
            }

            // Amount detection
            const cleanVal = parseFloat(val.replace(/[^0-9.]/g, ''));
            if (isNaN(cleanVal)) continue;

            if (col.includes('debit') || col.includes('withdrawal')) {
                if (cleanVal > 0) amount = cleanVal;
            } else if (col.includes('credit') || col.includes('deposit')) {
                if (cleanVal > 0) isCredit = true;
            } else if (col.includes('amount') && amount === 0) {
                // Fallback
                if (cleanVal > 0) amount = cleanVal;
            }
        }

        if (isCredit) continue; // Skip income

        if (date && amount > 0) {
            if (!txnId) {
                // Generate ID if missing
                const rawString = `${date.toISOString()}_${amount}_${description}`;
                txnId = crypto.createHash('md5').update(rawString).digest('hex');
            }

            expenses.push({
                date: date.toISOString(),
                amount,
                description,
                category: 'Uncategorized',
                transaction_id: txnId
            });
        }
    }
    return expenses;
};

exports.parseStatement = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Get user ID from auth middleware or body
        const userId = req.userId || req.body.user_id;
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }

        const ext = req.file.originalname.split('.').pop().toLowerCase();
        console.log(`[StatementController] Parsing file: ${req.file.originalname} (${ext}) for User: ${userId}`);

        let expenses = [];

        if (ext === 'pdf') {
            expenses = await parsePdf(req.file.buffer);
        } else {
            expenses = await parseCsv(req.file.buffer);
        }

        console.log(`[StatementController] Found ${expenses.length} raw expenses`);

        let inserted = 0;
        let skipped = 0;

        for (const expense of expenses) {
            // Use existing transaction ID or generate if not present
            let transactionId = expense.transaction_id;
            if (!transactionId) {
                const rawString = `${expense.date}_${expense.amount}_${expense.description}`;
                transactionId = crypto.createHash('md5').update(rawString).digest('hex');
            }

            // Check if exists
            const exists = await ExpenseModel.findByTransactionId(userId, transactionId);
            if (exists) {
                skipped++;
                continue;
            }

            // Insert
            await ExpenseModel.createWithTransactionId(
                userId,
                expense.amount,
                expense.category || 'Other',
                expense.date,
                expense.description,
                transactionId
            );
            inserted++;
        }

        console.log(`[StatementController] Processed: ${inserted} inserted, ${skipped} skipped`);

        res.json({
            message: 'Statement processed successfully',
            totalFound: expenses.length,
            inserted,
            skipped
        });

    } catch (error) {
        console.error("Parse Error:", error);
        res.status(500).json({ error: 'Failed to parse statement' });
    }
};
