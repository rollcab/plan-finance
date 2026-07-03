let appState = {
    baseFileName: "portfolio_config",
    config: { global: {}, loans: [] },
    schedule: [] // Array of month objects, each containing { date, combined: {}, loans: {} }
};

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Defaults
    const now = new Date();
    document.getElementById('startMonth').value = now.getMonth();
    document.getElementById('startYear').value = now.getFullYear();

    // Add first empty loan
    addLoanCard();

    // 2. Theme Toggling
    const themeToggleBtn = document.getElementById('themeToggle');
    const sunIcon = document.getElementById('sunIcon');
    const moonIcon = document.getElementById('moonIcon');
    if(document.documentElement.getAttribute('data-theme') === 'dark') { sunIcon.classList.remove('hidden'); moonIcon.classList.add('hidden'); }

    themeToggleBtn.addEventListener('click', () => {
        const html = document.documentElement;
        if (html.getAttribute('data-theme') === 'light') {
            html.setAttribute('data-theme', 'dark');
            sunIcon.classList.remove('hidden'); moonIcon.classList.add('hidden');
        } else {
            html.setAttribute('data-theme', 'light');
            sunIcon.classList.add('hidden'); moonIcon.classList.remove('hidden');
        }
    });

    // 3. UI Event Listeners
    document.getElementById('addLoanBtn').addEventListener('click', addLoanCard);
    
    // Toggle manual vs smart mode inputs
    document.getElementById('strategyMode').addEventListener('change', (e) => {
        const totalBudgetGroup = document.getElementById('totalBudgetGroup');
        const manualPaymentGroups = document.querySelectorAll('.manual-payment-group');
        
        if (e.target.value === 'smart') {
            totalBudgetGroup.classList.remove('hidden');
            manualPaymentGroups.forEach(el => el.classList.add('hidden'));
        } else {
            totalBudgetGroup.classList.add('hidden');
            manualPaymentGroups.forEach(el => el.classList.remove('hidden'));
        }
    });

    document.getElementById('viewSelector').addEventListener('change', renderTable);
    document.getElementById('calculateBtn').addEventListener('click', calculateSchedule);
    document.getElementById('exportConfigBtn').addEventListener('click', exportJSON);
    document.getElementById('importConfig').addEventListener('change', importJSON);
    document.getElementById('downloadCsvBtn').addEventListener('click', downloadCSV);
    
    document.getElementById('configNameInput').addEventListener('input', (e) => {
        appState.baseFileName = e.target.value.trim() || "portfolio_config";
    });
});

function addLoanCard(loanData = null) {
    const template = document.getElementById('loan-card-template');
    const clone = template.content.cloneNode(true);
    const loanCard = clone.querySelector('.loan-card');
    
    loanCard.querySelector('.remove-loan-btn').addEventListener('click', () => {
        loanCard.remove();
    });

    // If we are in smart mode, hide the individual payment input on new cards
    if (document.getElementById('strategyMode').value === 'smart') {
        loanCard.querySelector('.manual-payment-group').classList.add('hidden');
    }

    if (loanData) {
        loanCard.querySelector('.loan-name-input').value = loanData.name || '';
        loanCard.querySelector('.loan-principal').value = loanData.principal || '';
        loanCard.querySelector('.loan-roi').value = loanData.roi || '';
        loanCard.querySelector('.loan-payment').value = loanData.payment || '';
    }

    document.getElementById('loanList').appendChild(loanCard);
}

function gatherInputs() {
    const config = {
        global: {
            startMonth: parseInt(document.getElementById('startMonth').value),
            startYear: parseInt(document.getElementById('startYear').value),
            strategy: document.getElementById('strategyMode').value,
            totalBudget: parseFloat(document.getElementById('totalBudget').value) || 0
        },
        loans: []
    };

    const cards = document.querySelectorAll('.loan-card');
    cards.forEach((card, index) => {
        config.loans.push({
            id: `loan_${index}`, // Unique ID for tracking
            name: card.querySelector('.loan-name-input').value || `Loan ${index + 1}`,
            principal: parseFloat(card.querySelector('.loan-principal').value),
            roi: parseFloat(card.querySelector('.loan-roi').value),
            payment: parseFloat(card.querySelector('.loan-payment').value) || 0
        });
    });

    return config;
}

function calculateSchedule() {
    const config = gatherInputs();
    const errorMsg = document.getElementById('error-message');
    const resultsSection = document.getElementById('results');
    
    // Validation
    if (config.loans.length === 0) {
        showError("Please add at least one loan."); return;
    }
    for (let loan of config.loans) {
        if (isNaN(loan.principal) || isNaN(loan.roi) || (config.global.strategy === 'manual' && isNaN(loan.payment))) {
            showError("Please fill in all numerical fields for your loans."); return;
        }
    }
    if (config.global.strategy === 'smart' && isNaN(config.global.totalBudget)) {
        showError("Please enter a total monthly budget for Smart Allocation."); return;
    }

    // Initialize state
    let activeLoans = config.loans.map(l => ({ ...l, remaining: l.principal }));
    let schedule = [];
    let currentMonth = config.global.startMonth;
    let currentYear = config.global.startYear;
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let isFinished = false;
    let safetyCounter = 0; // Prevent infinite loops if payments don't cover interest

    while (!isFinished && safetyCounter < 1200) { // Max 100 years
        safetyCounter++;
        let monthData = {
            dateString: `${monthNames[currentMonth]} ${currentYear}`,
            month: currentMonth,
            year: currentYear,
            combined: { opening: 0, interest: 0, principalPaid: 0, closing: 0 },
            loans: {}
        };

        // Pre-calculate interest for all active loans to check viability
        let totalInterestThisMonth = 0;
        activeLoans.forEach(loan => {
            if (loan.remaining > 0) {
                totalInterestThisMonth += loan.remaining * (loan.roi / 12 / 100);
            }
        });

        // Allocation Logic
        if (config.global.strategy === 'smart') {
            if (config.global.totalBudget <= totalInterestThisMonth) {
                showError(`Your total budget (₹${config.global.totalBudget}) does not cover the combined monthly interest (₹${totalInterestThisMonth.toFixed(2)}). Portfolio will never close.`);
                return;
            }

            let budgetLeft = config.global.totalBudget;
            
            // 1. Pay all interest first to stop growth
            activeLoans.forEach(loan => {
                if (loan.remaining > 0) {
                    let interest = loan.remaining * (loan.roi / 12 / 100);
                    loan.currentMonthInterest = interest;
                    loan.currentMonthPayment = interest; // Start by paying just the interest
                    budgetLeft -= interest;
                }
            });

            // 2. Sort by highest ROI for avalanche
            let priorityLoans = [...activeLoans].filter(l => l.remaining > 0).sort((a, b) => b.roi - a.roi);
            
            // 3. Dump remaining budget into highest priority until paid off, then cascade
            for (let loan of priorityLoans) {
                if (budgetLeft <= 0) break;
                
                // How much principal is left on this loan?
                let principalToClear = loan.remaining;
                if (budgetLeft >= principalToClear) {
                    // Pay it off completely and keep the change for the next loan
                    loan.currentMonthPayment += principalToClear;
                    budgetLeft -= principalToClear;
                } else {
                    // Dump all remaining budget into this loan
                    loan.currentMonthPayment += budgetLeft;
                    budgetLeft = 0;
                }
            }

        } else {
            // Manual Mode: Just use the assigned payment
            activeLoans.forEach(loan => {
                if (loan.remaining > 0) {
                    let interest = loan.remaining * (loan.roi / 12 / 100);
                    loan.currentMonthInterest = interest;
                    
                    if (loan.payment <= interest) {
                        showError(`Payment for ${loan.name} (₹${loan.payment}) doesn't cover interest (₹${interest.toFixed(2)}).`);
                        return; // Exits logic
                    }
                    
                    // Cap payment if loan is ending
                    loan.currentMonthPayment = (loan.remaining + interest <= loan.payment) ? loan.remaining + interest : loan.payment;
                }
            });
            // Stop if an error was shown
            if (!document.getElementById('error-message').classList.contains('hidden')) return; 
        }

        // Apply Payments and Record State
        let anyLoanActive = false;

        activeLoans.forEach(loan => {
            if (loan.remaining > 0) {
                anyLoanActive = true;
                let interest = loan.currentMonthInterest;
                let principalPaid = loan.currentMonthPayment - interest;
                let opening = loan.remaining;
                
                loan.remaining -= principalPaid;
                if(loan.remaining < 0.01) loan.remaining = 0; // Float precision fix

                // Record individual
                monthData.loans[loan.id] = {
                    opening: opening.toFixed(2),
                    interest: interest.toFixed(2),
                    principalPaid: principalPaid.toFixed(2),
                    closing: loan.remaining.toFixed(2)
                };

                // Accumulate combined
                monthData.combined.opening += opening;
                monthData.combined.interest += interest;
                monthData.combined.principalPaid += principalPaid;
                monthData.combined.closing += loan.remaining;
            } else {
                // Loan is already paid off, record zeroes
                monthData.loans[loan.id] = { opening: "0.00", interest: "0.00", principalPaid: "0.00", closing: "0.00" };
            }
        });

        if (!anyLoanActive) {
            isFinished = true;
        } else {
            // Format combined totals
            monthData.combined.opening = monthData.combined.opening.toFixed(2);
            monthData.combined.interest = monthData.combined.interest.toFixed(2);
            monthData.combined.principalPaid = monthData.combined.principalPaid.toFixed(2);
            monthData.combined.closing = monthData.combined.closing.toFixed(2);
            
            schedule.push(monthData);

            currentMonth++;
            if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        }
    }

    if (safetyCounter >= 1200) {
        showError("Calculation exceeded 100 years. Please check your inputs."); return;
    }

    errorMsg.classList.add('hidden');
    resultsSection.classList.remove('hidden');

    appState.config = config;
    appState.schedule = schedule;

    // Update Dropdown UI
    const viewSelector = document.getElementById('viewSelector');
    viewSelector.innerHTML = '<option value="combined">Combined Portfolio Overview</option>';
    config.loans.forEach(loan => {
        const opt = document.createElement('option');
        opt.value = loan.id;
        opt.textContent = loan.name;
        viewSelector.appendChild(opt);
    });

    renderTable();
}

function renderTable() {
    if(appState.schedule.length === 0) return;
    
    const viewId = document.getElementById('viewSelector').value;
    const tbody = document.getElementById('scheduleBody');
    tbody.innerHTML = ''; 

    const now = new Date();
    const currentAbsoluteMonth = (now.getFullYear() * 12) + now.getMonth();

    let interestAlreadyPaid = 0;
    let interestToBePaid = 0;
    let overallInterestPaid = 0;

    appState.schedule.forEach(row => {
        const tr = document.createElement('tr');
        const rowAbsoluteMonth = (row.year * 12) + row.month;
        
        // Pick data based on dropdown selection
        let displayData = viewId === 'combined' ? row.combined : row.loans[viewId];
        
        // If the specific loan has ended, don't render empty trailing rows in individual view
        if (viewId !== 'combined' && parseFloat(displayData.opening) === 0) return;

        const rowInterest = parseFloat(displayData.interest);
        overallInterestPaid += rowInterest;
        
        if (rowAbsoluteMonth <= currentAbsoluteMonth) {
            tr.classList.add('past-row');
            interestAlreadyPaid += rowInterest;
        } else {
            interestToBePaid += rowInterest;
        }

        tr.innerHTML = `
            <td>${row.dateString}</td>
            <td>₹${Number(displayData.opening).toLocaleString('en-IN')}</td>
            <td>₹${Number(displayData.interest).toLocaleString('en-IN')}</td>
            <td>₹${Number(displayData.principalPaid).toLocaleString('en-IN')}</td>
            <td>₹${Number(displayData.closing).toLocaleString('en-IN')}</td>
        `;
        tbody.appendChild(tr);
    });

    // Update Summary Header (always shows combined summary logic for context)
    let finalRow = appState.schedule[appState.schedule.length - 1];
    
    // If viewing a specific loan, find *its* actual end date
    if (viewId !== 'combined') {
        const specificLoanRows = appState.schedule.filter(r => parseFloat(r.loans[viewId].opening) > 0);
        if(specificLoanRows.length > 0) finalRow = specificLoanRows[specificLoanRows.length - 1];
    }

    document.getElementById('closureDate').textContent = finalRow.dateString;
    document.getElementById('interestPaid').textContent = Number(interestAlreadyPaid.toFixed(2)).toLocaleString('en-IN');
    document.getElementById('interestRemaining').textContent = Number(interestToBePaid.toFixed(2)).toLocaleString('en-IN');
    document.getElementById('totalInterest').textContent = Number(overallInterestPaid.toFixed(2)).toLocaleString('en-IN');
}

function showError(message) {
    const errorMsg = document.getElementById('error-message');
    document.getElementById('results').classList.add('hidden');
    errorMsg.textContent = message;
    errorMsg.classList.remove('hidden');
}

// --- Helper Functions ---
function getFormattedTimestamp() {
    const now = new Date();
    const pad = (num) => String(num).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

// --- Import / Export Features ---

function exportJSON() {
    const config = gatherInputs();
    const timestamp = getFormattedTimestamp();
    const suggestedFileName = `${appState.baseFileName}.${timestamp}.json`;
    
    const finalFileName = prompt("Save configuration as:", suggestedFileName);
    if (!finalFileName) return; 

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", finalFileName);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    
    const tsEl = document.getElementById('configTimestamp');
    tsEl.textContent = `Last exported: ${timestamp}`;
    tsEl.classList.remove('hidden');
}

function importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const rawFileName = file.name.replace(/\.json$/i, '');
    const parts = rawFileName.split('.');
    
    appState.baseFileName = parts[0];
    document.getElementById('configNameInput').value = appState.baseFileName;
    const tsEl = document.getElementById('configTimestamp');
    if (parts.length > 1) {
        tsEl.textContent = `Loaded from: ${parts.slice(1).join('.')}`;
        tsEl.classList.remove('hidden');
    } else {
        tsEl.classList.add('hidden');
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const config = JSON.parse(e.target.result);
            
            // Set global
            if (config.global) {
                if(config.global.startMonth !== undefined) document.getElementById('startMonth').value = config.global.startMonth;
                if(config.global.startYear) document.getElementById('startYear').value = config.global.startYear;
                if(config.global.strategy) {
                    document.getElementById('strategyMode').value = config.global.strategy;
                    // trigger change event to update UI
                    document.getElementById('strategyMode').dispatchEvent(new Event('change')); 
                }
                if(config.global.totalBudget) document.getElementById('totalBudget').value = config.global.totalBudget;
            }

            // Clear existing and set loans
            document.getElementById('loanList').innerHTML = '';
            if (config.loans && config.loans.length > 0) {
                config.loans.forEach(loan => addLoanCard(loan));
                calculateSchedule();
            } else {
                addLoanCard(); // add empty if none
            }

        } catch (error) {
            alert("Invalid JSON file");
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function downloadCSV() {
    if (appState.schedule.length === 0) return;

    // Build a 2D Array for the CSV
    let csvRows = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    // Build Headers
    let headerRow = ["Config Key", "Config Value", "", "COMBINED Date", "Opening Principal", "Interest Portion", "Principal Portion", "Closing Principal"];
    appState.config.loans.forEach(loan => {
        headerRow.push("", `${loan.name.toUpperCase()} Date`, "Opening Principal", "Interest Portion", "Principal Portion", "Closing Principal");
    });
    csvRows.push(headerRow);

    // Prepare Config Data for the left columns
    let configData = [
        ["Start Month", monthNames[appState.config.global.startMonth]],
        ["Start Year", appState.config.global.startYear],
        ["Strategy", appState.config.global.strategy === 'smart' ? 'Smart (Highest ROI)' : 'Manual'],
    ];
    if (appState.config.global.strategy === 'smart') {
        configData.push(["Total Budget", appState.config.global.totalBudget]);
    } else {
        appState.config.loans.forEach(loan => configData.push([`${loan.name} Payment`, loan.payment]));
    }
    appState.config.loans.forEach(loan => {
        configData.push([`${loan.name} Principal`, loan.principal]);
        configData.push([`${loan.name} ROI`, loan.roi]);
    });

    // Build Data Rows
    appState.schedule.forEach((month, index) => {
        let row = [];
        
        // Add config data or empty strings if we ran out of config rows
        if (index < configData.length) {
            row.push(configData[index][0], configData[index][1]);
        } else {
            row.push("", "");
        }
        
        // Space
        row.push("");

        // Combined Data
        row.push(month.dateString, month.combined.opening, month.combined.interest, month.combined.principalPaid, month.combined.closing);

        // Individual Loan Data
        appState.config.loans.forEach(loanConfig => {
            row.push(""); // Spacing
            const lData = month.loans[loanConfig.id];
            if (lData) {
                row.push(month.dateString, lData.opening, lData.interest, lData.principalPaid, lData.closing);
            } else {
                row.push("", "", "", "", ""); // Should not happen, but safe fallback
            }
        });

        csvRows.push(row);
    });

    // Convert 2D array to CSV string safely
    const csvContent = csvRows.map(row => 
        row.map(cell => {
            // Escape quotes and wrap in quotes if there's a comma
            let cellStr = String(cell).replace(/"/g, '""');
            return cellStr.includes(',') || cellStr.includes('\n') ? `"${cellStr}"` : cellStr;
        }).join(",")
    ).join("\n"); // Proper newline

    // Trigger download using a Blob (Fixes the newline bug)
    const timestamp = getFormattedTimestamp();
    const defaultCsvName = `${appState.baseFileName}_schedule.${timestamp}.csv`;
    const finalFileName = prompt("Save CSV as:", defaultCsvName);
    if (!finalFileName) return;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", url);
    downloadAnchorNode.setAttribute("download", finalFileName);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    document.body.removeChild(downloadAnchorNode);
    URL.revokeObjectURL(url); // Clean up memory
}
