const pdf = require('pdf-parse');
const csv = require('csv-parser');
const fs = require('fs');
const { Readable } = require('stream');

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

// Skip the "in transaction section" check and match dates directly
const parseGooglePayPdf = (lines) => {
    const expenses = [];
    console.log('[GooglePay Parser] Starting parse...');
    console.log('[GooglePay Parser] Total lines:', lines.length);
    console.log('[GooglePay Parser] First 20 lines:', lines.slice(0, 20));

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Match date on its own line: "03 Jul, 2025"
        const dateMatch = line.match(/^(\d{1,2}\s+[A-Za-z]{3},?\s+\d{4})$/);
        if (!dateMatch) continue;

        const date = parseDate(dateMatch[1]);
        if (!date) {
            console.log(`[GooglePay] Failed to parse date: ${dateMatch[1]}`);
            continue;
        }
        console.log(`[GooglePay] Found date: ${dateMatch[1]} => ${date.toISOString()}`);

        let description = '';
        let amount = 0;
        let isDebit = false;

        // Look ahead up to 10 lines
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
            const next = lines[j].trim();
            console.log(`[GooglePay]   Checking line ${j}: "${next}"`);

            if (next.match(/^\d{1,2}\s+[A-Za-z]{3},?\s+\d{4}$/)) {
                console.log(`[GooglePay]   Hit another date, stopping`);
                break;
            }

            if (next.startsWith('Paid to ')) {
                isDebit = true;
                description = next.replace('Paid to ', '').trim();
                console.log(`[GooglePay]   Found DEBIT transaction: ${description}`);
            }
            if (next.startsWith('Received from')) {
                isDebit = false;
                console.log(`[GooglePay]   Found CREDIT transaction (skip)`);
                break;
            }
            const amt = next.match(/^₹?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)$/);
            if (amt && parseFloat(amt[1].replace(/,/g, '')) < 1000000) {
                amount = parseFloat(amt[1].replace(/,/g, ''));
                console.log(`[GooglePay]   Found amount: ₹${amount}`);
            }
        }

        if (isDebit && amount > 0 && description) {
            expenses.push({
                date: date.toISOString(),
                amount,
                description: description.substring(0, 50),
                category: 'Other'
            });
            console.log(`[GooglePay] ✓ Added expense: ${description} - ₹${amount}`);
        } else {
            console.log(`[GooglePay] ✗ Skipped (isDebit:${isDebit}, amount:${amount}, desc:"${description}")`);
        }
    }
    console.log(`[GooglePay] FINAL: Found ${expenses.length} total expenses`);
    return expenses;
};

const parsePaytmPdf = (lines) => {
    const expenses = [];
    console.log('[Paytm Parser] total lines:', lines.length);

    // Try to extract statement period from header (e.g., "1 APR'25 - 21 JAN'26")
    let periodStartMonth = null;
    let periodStartYear = null;
    let periodEndMonth = null;
    let periodEndYear = null;

    const monthMap = { 'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11 };

    for (let i = 0; i < Math.min(30, lines.length); i++) {
        const line = lines[i].toLowerCase();
        // Match: "1 APR'25 - 21 JAN'26" or "1 APR '25 - 21 JAN '26"
        const periodMatch = line.match(/(\d{1,2})\s+([a-z]{3})'?\s*(\d{2})\s*-\s*(\d{1,2})\s+([a-z]{3})'?\s*(\d{2})/);
        if (periodMatch) {
            periodStartMonth = monthMap[periodMatch[2]];
            periodStartYear = 2000 + parseInt(periodMatch[3]);
            periodEndMonth = monthMap[periodMatch[5]];
            periodEndYear = 2000 + parseInt(periodMatch[6]);
            console.log(`[Paytm] Found statement period: ${periodMatch[2]} ${periodStartYear} - ${periodMatch[5]} ${periodEndYear}`);
            break;
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Match date on its own line: "17 Jan"
        const dateMatch = line.match(/^(\d{1,2}\s+[A-Za-z]{3})$/);
        if (!dateMatch) continue;

        const dateStr = dateMatch[1];
        const parts = dateStr.split(' ');
        const day = parseInt(parts[0]);
        const monthStr = parts[1].toLowerCase().substring(0, 3);
        const month = monthMap[monthStr];

        if (month === undefined) continue;

        // Smart year inference using statement period
        let year = new Date().getFullYear();
        if (periodStartYear && periodEndYear) {
            // If we have statement period, use it to determine year
            if (periodStartYear === periodEndYear) {
                year = periodStartYear;
            } else {
                // Cross-year statement: if month is >= start month, use start year, else use end year
                if (month >= periodStartMonth) {
                    year = periodStartYear;
                } else {
                    year = periodEndYear;
                }
            }
        }

        const date = new Date(year, month, day);
        console.log(`[Paytm] date: ${dateStr} => ${year}-${month + 1}-${day} (${date.toISOString()})`);

        let description = '';
        let amount = 0;
        let category = 'Other';
        let isDebit = false;

        for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
            const next = lines[j].trim();
            if (next.match(/^\d{1,2}\s+[A-Za-z]{3}$/)) break;

            if (next.startsWith('Paid to ')) {
                isDebit = true;
                description = next.replace('Paid to ', '').split('UPI')[0].split('UP')[0].trim();
                console.log(`[Paytm]   Found: ${description}`);
            }
            const tag = next.match(/^#\s*([A-Za-z]+)$/);
            if (tag) {
                category = tag[1].charAt(0).toUpperCase() + tag[1].slice(1);
                console.log(`[Paytm]   Tag: ${category}`);
            }

            const amt = next.match(/^(?:Rs\.?|₹)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)$/);
            if (amt && parseFloat(amt[1].replace(/,/g, '')) < 1000000) {
                amount = parseFloat(amt[1].replace(/,/g, ''));
                console.log(`[Paytm]   Amount: ₹${amount}`);
            }
        }

        if (isDebit && amount > 0 && description) {
            expenses.push({
                date: date.toISOString(),
                amount,
                description: description.substring(0, 50),
                category
            });
            console.log(`[Paytm] ✓ Added: ${description} - ₹${amount} [${category}]`);
        }
    }
    console.log(`[Paytm] FINAL: Found ${expenses.length} expenses`);
    return expenses;
};

const parsePdf = async (buffer) => {
    try {
        const data = await pdf(buffer);
        const text = data.text;
        const lines = text.split('\n');

        console.log('[StatementController] PDF text extracted, analyzing format...');

        // Detect format
        const textLower = text.toLowerCase();
        let expenses = [];

        if (textLower.includes('google pay') || textLower.includes('googlepay')) {
            console.log('[StatementController] Detected Google Pay PDF format');
            expenses = parseGooglePayPdf(lines);
        } else if (textLower.includes('paytm') || textLower.includes('passbook payments')) {
            console.log('[StatementController] Detected Paytm PDF format');
            expenses = parsePaytmPdf(lines);
        } else {
            // Fallback to generic PhonePe parser
            console.log('[StatementController] Using generic PDF parser (PhonePe)');
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
