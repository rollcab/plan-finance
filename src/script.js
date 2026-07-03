let appState = {
    baseFileName: "portfolio_config",
    config: { global: {}, loans: [] },
    schedule: [] 
};

document.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    document.getElementById('startMonth').value = now.getMonth();
    document.getElementById('startYear').value = now.getFullYear();

    addLoanCard();

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

    document.getElementById('addLoanBtn').addEventListener('click', addLoanCard);
    
    // Toggle manual vs smart mode inputs & labels
    document.getElementById('strategyMode').addEventListener('change', (e) => {
        const totalBudgetGroup = document.getElementById('totalBudgetGroup');
        const dynamicLabels = document.querySelectorAll('.dynamic-payment-label');
        
        if (e.target.value === 'smart') {
            totalBudgetGroup.classList.remove('hidden');
            dynamicLabels.forEach(label => label.textContent = "Minimum EMI (₹)");
        } else {
            totalBudgetGroup.classList.add('hidden');
            dynamicLabels.forEach(label => label.textContent = "Planned Payment (₹)");
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

    // Sync the label based on current mode
    const mode = document.getElementById('strategyMode').value;
    loanCard.querySelector('.dynamic-payment-label').textContent = mode === 'smart' ? "Minimum EMI (₹)" : "Planned Payment (₹)";

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
            id: `loan_${index}`,
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
    
    if (config.loans.length === 0) {
        showError("Please add at least one loan."); return;
    }
    for (let loan of config.loans) {
        if (isNaN(loan.principal) || isNaN(loan.roi) || isNaN(loan.payment)) {
            showError("Please fill in all numerical fields for your loans."); return;
        }
    }
    if (config.global.strategy === 'smart' && isNaN(config.global.totalBudget)) {
        showError("Please enter a total monthly budget for Smart Allocation."); return;
    }

    let activeLoans = config.loans.map(l => ({ ...l, remaining: l.principal }));
    let schedule = [];
    let currentMonth = config.global.startMonth;
    let currentYear = config.global.startYear;
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let isFinished = false;
    let safetyCounter = 0; 

    while (!isFinished && safetyCounter < 1200) { 
        safetyCounter++;
        let monthData = {
            dateString: `${monthNames[currentMonth]} ${currentYear}`,
            month: currentMonth,
            year: currentYear,
            combined: { opening: 0, interest: 0, principalPaid: 0, closing: 0 },
            loans: {}
        };

        if (config.global.strategy === 'smart') {
            let totalEMIThisMonth = 0;
            let anyError = false;

            // 1. Calculate EMIs and Interests
            activeLoans.forEach(loan => {
                if (loan.remaining > 0) {
                    let interest = loan.remaining * (loan.roi / 12 / 100);
                    loan.currentMonthInterest = interest;

                    if (loan.payment < interest) {
                        showError(`Minimum EMI for ${loan.name} (₹${loan.payment}) doesn't cover interest (₹${interest.toFixed(2)}).`);
                        anyError = true; return;
                    }

                    let requiredPayment = (loan.remaining + interest <= loan.payment) ? loan.remaining + interest : loan.payment;
                    loan.currentMonthPayment = requiredPayment;
                    totalEMIThisMonth += requiredPayment;
                }
            });

            if (anyError) return;

            if (config.global.totalBudget < totalEMIThisMonth) {
                showError(`Your total budget (₹${config.global.totalBudget}) does not cover the combined Minimum EMIs (₹${totalEMIThisMonth.toFixed(2)}).`);
                return;
            }

            let budgetLeft = config.global.totalBudget - totalEMIThisMonth;
            
            // 2. Sort by highest ROI for avalanche and dump the remainder
            let priorityLoans = [...activeLoans].filter(l => l.remaining > 0).sort((a, b) => b.roi - a.roi);
            for (let loan of priorityLoans) {
                if (budgetLeft <= 0) break;
                
                let principalLeftAfterEMI = (loan.remaining + loan.currentMonthInterest) - loan.currentMonthPayment;
                if (budgetLeft >= principalLeftAfterEMI) {
                    loan.currentMonthPayment += principalLeftAfterEMI;
                    budgetLeft -= principalLeftAfterEMI;
                } else {
                    loan.currentMonthPayment += budgetLeft;
                    budgetLeft = 0;
                }
            }

        } else {
            // Manual Mode
            activeLoans.forEach(loan => {
                if (loan.remaining > 0) {
                    let interest = loan.remaining * (loan.roi / 12 / 100);
                    loan.currentMonthInterest = interest;
                    
                    if (loan.payment <= interest) {
                        showError(`Payment for ${loan.name} (₹${loan.payment}) doesn't cover interest (₹${interest.toFixed(2)}).`);
                        return; 
                    }
                    loan.currentMonthPayment = (loan.remaining + interest <= loan.payment) ? loan.remaining + interest : loan.payment;
                }
            });
            if (!document.getElementById('error-message').classList.contains('hidden')) return; 
        }

        let anyLoanActive = false;
        activeLoans.forEach(loan => {
            if (loan.remaining > 0) {
                anyLoanActive = true;
                let interest = loan.currentMonthInterest;
                let principalPaid = loan.currentMonthPayment - interest;
                let opening = loan.remaining;
                
                loan.remaining -= principalPaid;
                if(loan.remaining < 0.01) loan.remaining = 0;

                monthData.loans[loan.id] = {
                    opening: opening.toFixed(2),
                    interest: interest.toFixed(2),
                    principalPaid: principalPaid.toFixed(2),
                    closing: loan.remaining.toFixed(2)
                };

                monthData.combined.opening += opening;
                monthData.combined.interest += interest;
                monthData.combined.principalPaid += principalPaid;
                monthData.combined.closing += loan.remaining;
            } else {
                monthData.loans[loan.id] = { opening: "0.00", interest: "0.00", principalPaid: "0.00", closing: "0.00" };
            }
        });

        if (!anyLoanActive) {
            isFinished = true;
        } else {
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
        
        // 1. Calculate Summary Totals ALWAYS using combined data
        const combinedInterest = parseFloat(row.combined.interest);
        overallInterestPaid += combinedInterest;
        if (rowAbsoluteMonth <= currentAbsoluteMonth) {
            interestAlreadyPaid += combinedInterest;
        } else {
            interestToBePaid += combinedInterest;
        }

        // 2. Render Table Rows based on dropdown selection
        let displayData = viewId === 'combined' ? row.combined : row.loans[viewId];
        
        if (viewId !== 'combined' && parseFloat(displayData.opening) === 0) return;

        if (rowAbsoluteMonth <= currentAbsoluteMonth) tr.classList.add('past-row');

        tr.innerHTML = `
            <td>${row.dateString}</td>
            <td>₹${Number(displayData.opening).toLocaleString('en-IN')}</td>
            <td>₹${Number(displayData.interest).toLocaleString('en-IN')}</td>
            <td>₹${Number(displayData.principalPaid).toLocaleString('en-IN')}</td>
            <td>₹${Number(displayData.closing).toLocaleString('en-IN')}</td>
        `;
        tbody.appendChild(tr);
    });

    // Update Summary Header (always shows combined summary)
    const finalRow = appState.schedule[appState.schedule.length - 1];
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
            
            if (config.global) {
                if(config.global.startMonth !== undefined) document.getElementById('startMonth').value = config.global.startMonth;
                if(config.global.startYear) document.getElementById('startYear').value = config.global.startYear;
                if(config.global.strategy) {
                    document.getElementById('strategyMode').value = config.global.strategy;
                    document.getElementById('strategyMode').dispatchEvent(new Event('change')); 
                }
                if(config.global.totalBudget) document.getElementById('totalBudget').value = config.global.totalBudget;
            }

            document.getElementById('loanList').innerHTML = '';
            if (config.loans && config.loans.length > 0) {
                config.loans.forEach(loan => addLoanCard(loan));
                calculateSchedule();
            } else {
                addLoanCard(); 
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

    let csvRows = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    let headerRow = ["Config Key", "Config Value", "", "COMBINED Date", "Opening Principal", "Interest Portion", "Principal Portion", "Closing Principal"];
    appState.config.loans.forEach(loan => {
        headerRow.push("", `${loan.name.toUpperCase()} Date`, "Opening Principal", "Interest Portion", "Principal Portion", "Closing Principal");
    });
    csvRows.push(headerRow);

    let configData = [
        ["Start Month", monthNames[appState.config.global.startMonth]],
        ["Start Year", appState.config.global.startYear],
        ["Strategy", appState.config.global.strategy === 'smart' ? 'Smart (Highest ROI)' : 'Manual'],
    ];
    if (appState.config.global.strategy === 'smart') {
        configData.push(["Total Budget", appState.config.global.totalBudget]);
    } 
    // Always log the payment values (either Planned or Min EMI depending on context)
    appState.config.loans.forEach(loan => {
        configData.push([`${loan.name} Payment`, loan.payment]);
        configData.push([`${loan.name} Principal`, loan.principal]);
        configData.push([`${loan.name} ROI`, loan.roi]);
    });

    // Fix: Loop through the maximum length to ensure neither config nor schedule gets truncated
    const maxRows = Math.max(configData.length, appState.schedule.length);

    for (let i = 0; i < maxRows; i++) {
        let row = [];
        
        // Push config if it exists for this row
        if (i < configData.length) {
            row.push(configData[i][0], configData[i][1]);
        } else {
            row.push("", "");
        }
        
        row.push(""); 

        // Push schedule if it exists for this row
        if (i < appState.schedule.length) {
            const month = appState.schedule[i];
            row.push(month.dateString, month.combined.opening, month.combined.interest, month.combined.principalPaid, month.combined.closing);

            appState.config.loans.forEach(loanConfig => {
                row.push(""); 
                const lData = month.loans[loanConfig.id];
                if (lData) {
                    row.push(month.dateString, lData.opening, lData.interest, lData.principalPaid, lData.closing);
                } else {
                    row.push("", "", "", "", ""); 
                }
            });
        } else {
            // Buffer empty spaces if schedule is done but config is still printing
            row.push("", "", "", "", "");
            appState.config.loans.forEach(() => {
                row.push("", "", "", "", "", "");
            });
        }

        csvRows.push(row);
    }

    const csvContent = csvRows.map(row => 
        row.map(cell => {
            let cellStr = String(cell).replace(/"/g, '""');
            return cellStr.includes(',') || cellStr.includes('\n') ? `"${cellStr}"` : cellStr;
        }).join(",")
    ).join("\n"); 

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
    URL.revokeObjectURL(url); 
}
