const pdf = require('pdf-parse');
const csv = require('csv-parser');
const fs = require('fs');
const { Readable } = require('stream');

// Helper to parse date string
const parseDate = (dateStr) => {
    if (!dateStr) return null;
    dateStr = dateStr.trim().replace(/[./]/g, '-');

    // Try ISO first
    let d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;

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

    // Try dd MMM (e.g. 19 Jan) - Missing Year
    match = dateStr.match(/^(\d{1,2})\s+([A-Za-z]+)$/);
    if (match) {
        const day = parseInt(match[1]);
        const monthStr = match[2].toLowerCase().substring(0, 3);
        const year = new Date().getFullYear();
        const months = { 'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11 };
        if (months[monthStr] !== undefined) return new Date(year, months[monthStr], day);
    }

    // Try dd-MM-yyyy
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        let p1 = parseInt(parts[0]);
        let p2 = parseInt(parts[1]);
        let p3 = parseInt(parts[2]);
        if (p3 < 100) p3 += 2000;

        // Guess format: dd-mm-yyyy vs mm-dd-yyyy
        if (p1 > 12) return new Date(p3, p2 - 1, p1); // dd-mm-yyyy
        if (p2 > 12) return new Date(p3, p1 - 1, p2); // mm-dd-yyyy
        return new Date(p3, p2 - 1, p1); // Default dd-mm-yyyy
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

const processTransactionBlock = (block, expenses) => {
    if (!block || block.length === 0) return;
    const fullText = block.join(' ');

    // 1. Extract Date
    const dateRegex = /(\d{2}[-/]\d{2}[-/]\d{4}|\d{1,2}\s+[A-Za-z]+,?\s+\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3})/;
    const dateMatch = block[0].match(dateRegex);
    if (!dateMatch) return;

    const date = parseDate(dateMatch[0]);
    if (!date) return;

    // 2. Extract Amount
    const amountRegex = /(?:₹|Rs\.?|INR|INR\s)\s*([\d,]+(?:\.\d{1,2})?)/g;
    let allAmounts = [];
    let match;
    while ((match = amountRegex.exec(fullText)) !== null) {
        const val = parseFloat(match[1].replace(/,/g, ''));
        if (val > 0) allAmounts.push(val);
    }

    // 3. Identify Debit vs Credit & Description & Category
    let isDebit = false;
    let amount = 0;
    let description = "";
    let category = "Other";

    // Extract Tag
    const tagRegex = /(?:Tag:\s*)?#\s*([A-Za-z0-9]+)/;
    const tagMatch = fullText.match(tagRegex);
    if (tagMatch) {
        const tag = tagMatch[1].trim();
        if (tag) category = tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase();
    }

    // GPay / PhonePe / Paytm Logic
    const paidToRegex = /(?:Paid to|Sent to|Money Sent to|Paid Successfully to)\s+(.+?)(?:\s+(?:DEBIT|CREDIT|₹|Rs|INR|Transaction|Txn|Ref)|$)/;
    const paidToMatch = fullText.match(paidToRegex);

    if (paidToMatch) {
        isDebit = true;
        description = paidToMatch[1].trim();
        const garbage = ['Transaction ID', 'Txn ID', 'Ref No', 'UPI', 'Debited from'];
        garbage.forEach(g => {
            if (description.includes(g)) description = description.split(g)[0].trim();
        });

        // Fallback Amount Logic
        if (allAmounts.length === 0) {
            const looseAmountRegex = /\b\d+(?:[.,]\d+)*\b/g;
            let candidates = [];
            let m;
            while ((m = looseAmountRegex.exec(fullText)) !== null) {
                const s = m[0];
                if (s.includes(':')) continue; // Exclude time
                if (s.length === 4 && (s.startsWith('20') || s.startsWith('19'))) {
                    const val = parseInt(s);
                    if (val > 1900 && val < 2100) continue; // Exclude year
                }
                const val = parseFloat(s.replace(/,/g, ''));
                if (val > 0 && val < 10000000) candidates.push(val);
            }

            if (candidates.length > 0) {
                const decimalCandidates = candidates.filter(c => c % 1 !== 0);
                if (decimalCandidates.length > 0) {
                    allAmounts = [decimalCandidates[0]];
                } else {
                    const day = date.getDate();
                    candidates = candidates.filter(c => c !== day);
                    if (candidates.length > 0) allAmounts = [candidates[candidates.length - 1]];
                }
            }
        }
    } else if (fullText.includes("Received from")) {
        return; // Income
    } else if (fullText.includes("Debited from") || fullText.toUpperCase().includes("DEBIT")) {
        isDebit = true;
        description = "Debit Transaction";
    } else if (fullText.toUpperCase().includes("/DR") || fullText.toUpperCase().includes(" DR ")) {
        isDebit = true;
    }

    // Negative Amount Check
    const negativeAmountRegex = /-\s*(?:Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/;
    const negMatch = fullText.match(negativeAmountRegex);
    if (negMatch) {
        isDebit = true;
        amount = parseFloat(negMatch[1].replace(/,/g, ''));
    } else if (allAmounts.length > 0) {
        amount = allAmounts[0];
    }

    if (!isDebit || amount === 0) return;

    if (!description || description === "Debit Transaction") {
        description = extractPayeeName(fullText, "Expense");
    }

    description = description.replace(/\s+/g, ' ').trim();
    description = description.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
    if (description.length > 50) description = description.substring(0, 50);

    expenses.push({
        date: date.toISOString(),
        amount,
        description,
        category
    });
};

const parsePdf = async (buffer) => {
    try {
        const data = await pdf(buffer);
        const text = data.text;
        const lines = text.split('\n');
        const expenses = [];

        const dateStartRegex = /^(\d{2}[-/]\d{2}[-/]\d{4}|\d{1,2}\s+[A-Za-z]+,?\s+\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3})/;
        let transactionBuffer = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (dateStartRegex.test(trimmed)) {
                if (transactionBuffer.length > 0) {
                    processTransactionBlock(transactionBuffer, expenses);
                    transactionBuffer = [];
                }
                transactionBuffer.push(trimmed);
            } else if (transactionBuffer.length > 0) {
                transactionBuffer.push(trimmed);
            }
        }

        if (transactionBuffer.length > 0) {
            processTransactionBlock(transactionBuffer, expenses);
        }

        return expenses;
    } catch (error) {
        console.error("PDF Parse Error:", error);
        return [];
    }
};

const parseCsv = async (buffer) => {
    const content = buffer.toString('utf8');

    // Simple CSV parser that handles quoted fields
    // We can use the 'csv-parser' library but we need to stream it.
    // Since we have the buffer, let's just split by newline for simplicity 
    // and use a regex for splitting commas respecting quotes.

    // Let's use a simple line-based approach first as our logic is line-based mostly
    const lines = content.split(/\r?\n/);
    const parsedRows = [];

    for (let line of lines) {
        // Basic CSV split, handling quotes is complex but let's try simple split first
        // or use a regex: /,(?=(?:(?:[^"]*"){2})*[^"]*$)/
        const row = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.trim().replace(/^"|"$/g, ''));
        parsedRows.push(row);
    }

    // Reuse the logic from Dart port
    return parseCsvRows(parsedRows);
};

const parseCsvRows = (rows) => {
    let expenses = [];
    if (rows.length === 0) return [];

    // 1. Identify Headers
    let headerIndex = -1;
    let headers = [];

    for (let i = 0; i < rows.length; i++) {
        const rowStr = rows[i].map(e => e.toLowerCase().trim());
        if (rowStr.includes('date') || rowStr.includes('transaction date') || rowStr.includes('dt')) {
            headerIndex = i;
            headers = rowStr;
            break;
        }
    }

    if (headerIndex === -1) return [];

    // 2. Detect Format
    let format = 'generic';
    if (headers.includes('phonepe') || (headers.includes('transaction id') && headers.includes('provider reference id'))) {
        format = 'phonepe';
    } else if (headers.includes('google pay') || (headers.includes('transaction id') && headers.includes('status') && headers.includes('amount'))) {
        format = 'gpay';
    } else if (headers.includes('wallet txn id') || (headers.includes('debit') && headers.includes('credit') && headers.includes('activity'))) {
        format = 'paytm';
    }

    console.log(`[StatementController] Detected CSV Format: ${format}`);

    // 3. Parse Rows
    for (let i = headerIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length === 0 || (row.length === 1 && !row[0])) continue;

        try {
            let date = null;
            let amount = 0;
            let description = "Expense";
            let isDebit = false;

            if (format === 'phonepe') {
                const dateIdx = headers.findIndex(h => h.includes('date'));
                const amountIdx = headers.findIndex(h => h.includes('amount'));
                const typeIdx = headers.findIndex(h => h.includes('type') || h.includes('cr/dr'));
                const descIdx = headers.findIndex(h => h.includes('description') || h.includes('remarks') || h.includes('note'));
                const statusIdx = headers.findIndex(h => h.includes('status'));

                if (dateIdx !== -1 && row[dateIdx]) date = parseDate(row[dateIdx]);

                if (statusIdx !== -1 && row[statusIdx]) {
                    const status = row[statusIdx].toLowerCase();
                    if (!status.includes('success') && !status.includes('completed')) continue;
                }

                if (amountIdx !== -1 && row[amountIdx]) {
                    const val = row[amountIdx].replace(/[^0-9.-]/g, '');
                    amount = parseFloat(val) || 0;
                }

                if (typeIdx !== -1 && row[typeIdx]) {
                    const type = row[typeIdx].toLowerCase();
                    if (type.includes('debit') || type.includes('dr')) isDebit = true;
                } else {
                    if (amount > 0) isDebit = true;
                }

                if (descIdx !== -1 && row[descIdx]) description = row[descIdx];

            } else if (format === 'gpay') {
                const dateIdx = headers.findIndex(h => h.includes('date'));
                const amountIdx = headers.findIndex(h => h.includes('amount'));
                const descIdx = headers.findIndex(h => h.includes('description') || h.includes('title'));
                const statusIdx = headers.findIndex(h => h.includes('status'));

                if (dateIdx !== -1 && row[dateIdx]) date = parseDate(row[dateIdx]);

                if (statusIdx !== -1 && row[statusIdx]) {
                    const status = row[statusIdx].toLowerCase();
                    if (!status.includes('success') && !status.includes('completed')) continue;
                }

                if (amountIdx !== -1 && row[amountIdx]) {
                    let val = row[amountIdx];
                    if (val.includes('-')) isDebit = true;
                    val = val.replace(/[^0-9.]/g, '');
                    amount = parseFloat(val) || 0;
                }

                if (descIdx !== -1 && row[descIdx]) {
                    description = row[descIdx];
                    if (description.toLowerCase().startsWith('sent to') || description.toLowerCase().startsWith('paid to')) {
                        isDebit = true;
                    }
                }

            } else if (format === 'paytm') {
                const dateIdx = headers.findIndex(h => h.includes('date'));
                const debitIdx = headers.findIndex(h => h.includes('debit'));
                const descIdx = headers.findIndex(h => h.includes('source') || h.includes('destination') || h.includes('activity'));
                const statusIdx = headers.findIndex(h => h.includes('status'));

                if (dateIdx !== -1 && row[dateIdx]) date = parseDate(row[dateIdx]);

                if (statusIdx !== -1 && row[statusIdx]) {
                    const status = row[statusIdx].toLowerCase();
                    if (!status.includes('success') && !status.includes('completed')) continue;
                }

                if (debitIdx !== -1 && row[debitIdx]) {
                    const val = row[debitIdx].replace(/[^0-9.-]/g, '');
                    if (val) {
                        amount = parseFloat(val) || 0;
                        if (amount > 0) isDebit = true;
                    }
                }

                if (descIdx !== -1 && row[descIdx]) description = row[descIdx];

            } else {
                // Generic
                let dateIdx = -1, amountIdx = -1, debitIdx = -1, descIdx = -1, typeIdx = -1;
                headers.forEach((h, j) => {
                    if (h.includes('date') || h === 'dt') dateIdx = j;
                    else if (h.includes('debit') || h.includes('withdrawal')) debitIdx = j;
                    else if (h.includes('amount')) amountIdx = j;
                    else if (h.includes('desc') || h.includes('particular') || h.includes('narration')) descIdx = j;
                    else if (h.includes('type') || h.includes('dr/cr')) typeIdx = j;
                });

                if (dateIdx !== -1 && row[dateIdx]) date = parseDate(row[dateIdx]);

                if (date) {
                    if (debitIdx !== -1 && row[debitIdx]) {
                        const val = row[debitIdx].replace(/[^0-9.-]/g, '');
                        if (val) {
                            amount = parseFloat(val) || 0;
                            if (amount > 0) isDebit = true;
                        }
                    }
                    if (!isDebit && amountIdx !== -1 && row[amountIdx]) {
                        const val = row[amountIdx].replace(/[^0-9.-]/g, '');
                        amount = parseFloat(val) || 0;
                        if (typeIdx !== -1 && row[typeIdx]) {
                            const type = row[typeIdx].toLowerCase();
                            if (type.includes('dr') || type.includes('debit')) isDebit = true;
                        } else {
                            isDebit = true;
                        }
                    }
                    if (descIdx !== -1 && row[descIdx]) description = row[descIdx];
                }
            }

            if (date && amount > 0 && isDebit) {
                description = description.replace(/Paid to /g, '').trim();
                expenses.push({
                    date: date.toISOString(),
                    amount,
                    description: description.trim(),
                    category: 'Other'
                });
            }
        } catch (e) {
            console.error(`Error parsing CSV row ${i}:`, e);
        }
    }
    return expenses;
};

exports.parseStatement = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const ext = req.file.originalname.split('.').pop().toLowerCase();
        console.log(`[StatementController] Parsing file: ${req.file.originalname} (${ext})`);

        let expenses = [];

        if (ext === 'pdf') {
            expenses = await parsePdf(req.file.buffer);
        } else {
            expenses = await parseCsv(req.file.buffer);
        }

        console.log(`[StatementController] Found ${expenses.length} expenses`);
        res.json(expenses);

    } catch (error) {
        console.error("Parse Error:", error);
        res.status(500).json({ error: 'Failed to parse statement' });
    }
};
