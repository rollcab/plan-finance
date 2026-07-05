let appState = {
    baseFileName: "portfolio_config",
    config: { global: {}, loans: [] },
    schedule: [],
    simulations: {},
    baselineSummary: null // Stores the "Bank EMI Only" baseline
};

const STRATEGY_NAMES = {
    'manual': 'Manual Mode',
    'equal': 'Equally Split Extra',
    'highest_interest': 'Highest Monthly Interest',
    'smart': 'Highest ROI (Avalanche)'
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
    
    document.getElementById('strategyMode').addEventListener('change', (e) => {
        const tbInput = document.getElementById('totalBudget');
        const manualNote = document.getElementById('manualBudgetNote');
        const minNote = document.getElementById('minBudgetNote');
        
        if (e.target.value === 'manual') {
            tbInput.readOnly = true;
            tbInput.classList.add('disabled-input');
            manualNote.classList.remove('hidden');
            minNote.classList.add('hidden');
        } else {
            tbInput.readOnly = false;
            tbInput.classList.remove('disabled-input');
            manualNote.classList.add('hidden');
        }
        updateMinBudgetDisplay();
    });

    document.getElementById('loanList').addEventListener('input', (e) => {
        updateMinBudgetDisplay();
        
        if (e.target.classList.contains('loan-principal') || e.target.classList.contains('loan-roi')) {
            const card = e.target.closest('.loan-card');
            updateLoanMinNote(card);
            updateImpliedRate(card);
        }
        
        if (e.target.classList.contains('loan-monthly-interest') || e.target.classList.contains('loan-principal')) {
            const card = e.target.closest('.loan-card');
            updateImpliedRate(card);
        }
        
        if (e.target.classList.contains('loan-principal') || e.target.classList.contains('loan-min-lumpsum')) {
            const card = e.target.closest('.loan-card');
            updateLumpsumNote(card);
        }
    });

    document.getElementById('viewSelector').addEventListener('change', renderTable);
    document.getElementById('calculateBtn').addEventListener('click', handleCalculate);
    document.getElementById('exportConfigBtn').addEventListener('click', exportJSON);
    document.getElementById('importConfig').addEventListener('change', importJSON);
    document.getElementById('downloadCsvBtn').addEventListener('click', downloadCSV);
    
    document.getElementById('configNameInput').addEventListener('input', (e) => {
        appState.baseFileName = e.target.value.trim() || "portfolio_config";
    });
});

function updateLoanMinNote(card) {
    const principal = parseFloat(card.querySelector('.loan-principal').value);
    const roi = parseFloat(card.querySelector('.loan-roi').value);
    const noteEl = card.querySelector('.loan-min-note');
    
    if (!isNaN(principal) && !isNaN(roi) && principal > 0) {
        const minRequired = Math.ceil((principal * (roi / 12 / 100)) + 1);
        noteEl.textContent = `Must be at least ₹${minRequired.toLocaleString('en-IN')} to clear interest`;
        noteEl.classList.remove('hidden');
    } else {
        noteEl.classList.add('hidden');
    }
}

function updateMinBudgetDisplay() {
    let totalEmi = 0;
    document.querySelectorAll('.emi-tracker').forEach(input => {
        const val = parseFloat(input.value);
        if (!isNaN(val)) totalEmi += val;
    });
    
    const mode = document.getElementById('strategyMode').value;
    const tbInput = document.getElementById('totalBudget');
    const noteEl = document.getElementById('minBudgetNote');

    if (mode === 'manual') {
        tbInput.value = totalEmi; 
    } else {
        if (totalEmi > 0) {
            noteEl.textContent = `Minimum required to cover Planned Payments: ₹${totalEmi.toLocaleString('en-IN')}`;
            noteEl.classList.remove('hidden');
        } else {
            noteEl.classList.add('hidden');
        }
    }
}

function addLoanCard(loanData = null) {
    const template = document.getElementById('loan-card-template');
    const clone = template.content.cloneNode(true);
    const loanCard = clone.querySelector('.loan-card');
    const typeSelector = clone.querySelector('.loan-type-selector');
    const bankFields = clone.querySelector('.bank-loan-fields');
    const moneyLenderFields = clone.querySelector('.moneyLender-loan-fields');
    const infoBanner = clone.querySelector('.loan-type-info-banner');
    
    loanCard.querySelector('.remove-loan-btn').addEventListener('click', () => {
        loanCard.remove();
        updateMinBudgetDisplay();
    });

    typeSelector.addEventListener('change', (e) => {
        const type = e.target.value;
        if (type === 'bank') {
            bankFields.classList.remove('hidden');
            moneyLenderFields.classList.add('hidden');
            infoBanner.classList.add('hidden');
            loanCard.classList.remove('moneyLender-card');
        } else {
            bankFields.classList.add('hidden');
            moneyLenderFields.classList.remove('hidden');
            infoBanner.classList.remove('hidden');
            loanCard.classList.add('moneyLender-card');
            updateImpliedRate(loanCard);
        }
        updateMinBudgetDisplay();
    });

    if (loanData) {
        loanCard.querySelector('.loan-name-input').value = loanData.name || '';
        loanCard.querySelector('.loan-principal').value = loanData.principal || '';
        
        if (loanData.loanType === 'moneyLender') {
            typeSelector.value = 'moneyLender';
            bankFields.classList.add('hidden');
            moneyLenderFields.classList.remove('hidden');
            infoBanner.classList.remove('hidden');
            loanCard.classList.add('moneyLender-card');
            loanCard.querySelector('.loan-monthly-interest').value = loanData.monthlyInterest || '';
            loanCard.querySelector('.loan-min-lumpsum').value = loanData.minimumLumpsum || '';
            loanCard.querySelector('.loan-rd-rate').value = loanData.rdInterestRate || '';
            loanCard.querySelector('.loan-payment').value = loanData.payment || '';
            updateImpliedRate(loanCard);
            updateLumpsumNote(loanCard);
        } else {
            typeSelector.value = 'bank';
            loanCard.querySelector('.loan-roi').value = loanData.roi || '';
            loanCard.querySelector('.loan-bank-emi').value = loanData.bankEmi || '';
            loanCard.querySelector('.loan-payment').value = loanData.payment || '';
            updateLoanMinNote(loanCard);
        }
    }

    document.getElementById('loanList').appendChild(loanCard);
    updateMinBudgetDisplay();
}

function updateImpliedRate(card) {
    const moneyLenderFields = card.querySelector('.moneyLender-loan-fields');
    const rateEl = card.querySelector('.loan-implied-rate');
    
    if (!rateEl) return;
    
    if (!moneyLenderFields || moneyLenderFields.classList.contains('hidden')) {
        rateEl.classList.add('hidden');
        return;
    }
    
    const principal = parseFloat(moneyLenderFields.querySelector('.loan-principal').value);
    const monthlyInterest = parseFloat(moneyLenderFields.querySelector('.loan-monthly-interest').value);
    
    if (!isNaN(principal) && !isNaN(monthlyInterest) && principal > 0 && monthlyInterest > 0) {
        const impliedRate = (monthlyInterest / principal) * 12 * 100;
        rateEl.textContent = `Implied Interest Rate: ${impliedRate.toFixed(2)}% p.a.`;
        rateEl.classList.remove('hidden');
    } else {
        rateEl.classList.add('hidden');
    }
}

function updateLumpsumNote(card) {
    const moneyLenderFields = card.querySelector('.moneyLender-loan-fields');
    const noteEl = card.querySelector('.loan-lumpsum-note');
    
    if (!noteEl) return;
    
    if (!moneyLenderFields || moneyLenderFields.classList.contains('hidden')) {
        noteEl.classList.add('hidden');
        return;
    }
    
    const principal = parseFloat(moneyLenderFields.querySelector('.loan-principal').value);
    const minLumpsum = parseFloat(moneyLenderFields.querySelector('.loan-min-lumpsum').value);
    
    if (!isNaN(principal) && !isNaN(minLumpsum) && principal > 0 && minLumpsum > 0) {
        if (minLumpsum > principal) {
            noteEl.textContent = `⚠️ Minimum lumpsum cannot exceed principal (₹${principal.toLocaleString('en-IN')})`;
            noteEl.classList.remove('hidden');
        } else {
            noteEl.classList.add('hidden');
        }
    } else {
        noteEl.classList.add('hidden');
    }
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
        const typeSelector = card.querySelector('.loan-type-selector');
        const loanType = typeSelector ? typeSelector.value : 'bank';
        
        if (loanType === 'moneyLender') {
            const moneyLenderFields = card.querySelector('.moneyLender-loan-fields');
            config.loans.push({
                id: `loan_${index}`,
                loanType: 'moneyLender',
                name: card.querySelector('.loan-name-input').value || `Loan ${index + 1}`,
                principal: parseFloat(moneyLenderFields.querySelector('.loan-principal').value),
                monthlyInterest: parseFloat(moneyLenderFields.querySelector('.loan-monthly-interest').value),
                minimumLumpsum: parseFloat(moneyLenderFields.querySelector('.loan-min-lumpsum').value),
                rdInterestRate: parseFloat(moneyLenderFields.querySelector('.loan-rd-rate').value),
                payment: parseFloat(moneyLenderFields.querySelector('.loan-payment').value) || 0
            });
        } else {
            const bankFields = card.querySelector('.bank-loan-fields');
            config.loans.push({
                id: `loan_${index}`,
                loanType: 'bank',
                name: card.querySelector('.loan-name-input').value || `Loan ${index + 1}`,
                principal: parseFloat(bankFields.querySelector('.loan-principal').value),
                roi: parseFloat(bankFields.querySelector('.loan-roi').value),
                bankEmi: parseFloat(bankFields.querySelector('.loan-bank-emi').value),
                payment: parseFloat(bankFields.querySelector('.loan-payment').value) || 0
            });
        }
    });
    return config;
}

function handleCalculate() {
    const config = gatherInputs();
    const errorMsg = document.getElementById('error-message');
    const resultsSection = document.getElementById('results');
    
    if (config.loans.length === 0) {
        showError("Please add at least one loan."); return;
    }
    
    let baseEmiTotal = 0;
    for (let loan of config.loans) {
        if (loan.loanType === 'moneyLender') {
            if (isNaN(loan.principal) || isNaN(loan.monthlyInterest) || isNaN(loan.minimumLumpsum) || isNaN(loan.rdInterestRate) || isNaN(loan.payment)) {
                showError(`Please fill in all fields for money lender loan: ${loan.name}`); return;
            }
            if (loan.monthlyInterest <= 0) {
                showError(`Monthly interest for ${loan.name} must be greater than 0`); return;
            }
            if (loan.minimumLumpsum <= 0) {
                showError(`Minimum lumpsum for ${loan.name} must be greater than 0`); return;
            }
            if (loan.minimumLumpsum > loan.principal) {
                showError(`Minimum lumpsum for ${loan.name} (₹${loan.minimumLumpsum}) cannot exceed principal (₹${loan.principal})`); return;
            }
            if (loan.rdInterestRate < 0) {
                showError(`RD/SB interest rate for ${loan.name} cannot be negative`); return;
            }
            if (loan.payment < loan.monthlyInterest) {
                showError(`'How much you want to pay' for ${loan.name} (₹${loan.payment}) must be at least the monthly interest (₹${loan.monthlyInterest})`); return;
            }
            baseEmiTotal += loan.monthlyInterest;
        } else {
            if (isNaN(loan.principal) || isNaN(loan.roi) || isNaN(loan.bankEmi) || isNaN(loan.payment)) {
                showError("Please fill in all numerical fields for your loans."); return;
            }
            
            const absoluteMin = Math.ceil((loan.principal * (loan.roi / 12 / 100)) + 1);
            if (loan.bankEmi < absoluteMin) {
                showError(`Actual Bank EMI for ${loan.name} (₹${loan.bankEmi}) is too low. You must pay at least ₹${absoluteMin} to cover interest.`); return;
            }
            if (loan.payment < loan.bankEmi) {
                showError(`'How much you want to pay' for ${loan.name} (₹${loan.payment}) cannot be less than the Bank EMI (₹${loan.bankEmi}).`); return;
            }
            baseEmiTotal += loan.monthlyInterest;
        }
    }

    if (config.global.strategy !== 'manual' && (isNaN(config.global.totalBudget) || config.global.totalBudget < baseEmiTotal)) {
        showError(`For automated allocation, your Total Monthly Budget must be at least ₹${baseEmiTotal.toLocaleString('en-IN')} to cover all base payments.`); 
        return;
    }

    // 1. Calculate Baseline: What if they only paid the strict Bank EMI or minimum for money lenders?
    let baselineConfig = JSON.parse(JSON.stringify(config));
    baselineConfig.global.strategy = 'manual';
    baselineConfig.loans.forEach(l => {
        if (l.loanType === 'moneyLender') {
            l.payment = l.monthlyInterest;
        } else {
            l.payment = l.bankEmi;
        }
    }); 
    const baselineResult = runSimulation(baselineConfig, 'manual');
    if (!baselineResult.error) {
        appState.baselineSummary = summarizeSchedule(baselineResult.schedule, baselineConfig);
    } else {
        const fallbackLoans = {};
        config.loans.forEach(l => {
            fallbackLoans[l.id] = { name: l.name, paid: 0, remain: 0, total: 0, date: 'N/A', principal: l.principal };
        });
        appState.baselineSummary = { 
            combined: { paid: 0, remain: 0, total: 0, date: 'N/A', principal: config.loans.reduce((sum, l) => sum + l.principal, 0) }, 
            loans: fallbackLoans 
        };
    }

    // 2. Run selected user strategy
    const mainResult = runSimulation(config, config.global.strategy);
    if (mainResult.error) {
        showError(mainResult.error); return;
    }

    appState.config = config;
    appState.schedule = mainResult.schedule;
    appState.simulations = {};
    
    // 3. Run all other strategies for comparison pills
    const simulationBudget = Math.max(config.global.totalBudget, baseEmiTotal);
    Object.keys(STRATEGY_NAMES).forEach(strategyKey => {
        let simConfig = JSON.parse(JSON.stringify(config)); 
        simConfig.global.strategy = strategyKey;
        simConfig.global.totalBudget = simulationBudget; 
        
        const simResult = runSimulation(simConfig, strategyKey);
        if (!simResult.error) {
            appState.simulations[strategyKey] = summarizeSchedule(simResult.schedule, simConfig);
        }
    });

    errorMsg.classList.add('hidden');
    resultsSection.classList.remove('hidden');

    const viewSelector = document.getElementById('viewSelector');
    viewSelector.innerHTML = '<option value="combined">Combined Portfolio Overview</option>';
    config.loans.forEach(loan => {
        const opt = document.createElement('option');
        opt.value = loan.id;
        opt.textContent = loan.name;
        viewSelector.appendChild(opt);
    });

    renderSummaries();
    renderTable();
}

function runSimulation(config, strategyType) {
    let activeLoans = config.loans.map(l => {
        const loanCopy = { ...l, remaining: l.principal };
        if (l.loanType === 'moneyLender') {
            loanCopy.rdBalance = 0;
            loanCopy.rdPaidFromThisMonth = false;
        }
        return loanCopy;
    });
    
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
            combined: { opening: 0, interest: 0, principalPaid: 0, totalPayment: 0, closing: 0 },
            loans: {}
        };

        if (strategyType !== 'manual') {
            let totalBasePaymentThisMonth = 0;
            
            for (let loan of activeLoans) {
                if (loan.remaining > 0) {
                    if (loan.loanType === 'moneyLender') {
                        loan.currentMonthInterest = loan.monthlyInterest;
                        loan.currentMonthPayment = loan.monthlyInterest;
                    } else {
                        let interest = loan.remaining * (loan.roi / 12 / 100);
                        loan.currentMonthInterest = interest;
                        let requiredPayment = (loan.remaining + interest <= loan.payment) ? loan.remaining + interest : loan.payment;
                        loan.currentMonthPayment = requiredPayment;
                    }
                    totalBasePaymentThisMonth += loan.currentMonthPayment;
                }
            }

            let budgetLeft = config.global.totalBudget - totalBasePaymentThisMonth;
            
            if (budgetLeft > 0.01) {
                let moneyLenderLoans = activeLoans.filter(l => l.loanType === 'moneyLender' && l.remaining > 0);
                let bankLoans = activeLoans.filter(l => l.loanType !== 'moneyLender' && l.remaining > 0);
                
                if (strategyType === 'equal') {
                    let allLoans = [...moneyLenderLoans, ...bankLoans];
                    let priorityLoans = allLoans.filter(l => {
                        if (l.loanType === 'moneyLender') return true;
                        return (l.remaining + l.currentMonthInterest - l.currentMonthPayment) > 0.01;
                    });
                    
                    while (budgetLeft > 0.01 && priorityLoans.length > 0) {
                        let splitAmount = budgetLeft / priorityLoans.length;
                        let budgetSpentThisRound = 0;
                        let stillNeedingExtra = [];

                        for (let loan of priorityLoans) {
                            if (loan.loanType === 'moneyLender') {
                                loan.rdToAdd = (loan.rdToAdd || 0) + splitAmount;
                                budgetSpentThisRound += splitAmount;
                            } else {
                                let principalLeft = (loan.remaining + loan.currentMonthInterest) - loan.currentMonthPayment;
                                if (splitAmount >= principalLeft) {
                                    loan.currentMonthPayment += principalLeft;
                                    budgetSpentThisRound += principalLeft;
                                } else {
                                    loan.currentMonthPayment += splitAmount;
                                    budgetSpentThisRound += splitAmount;
                                    stillNeedingExtra.push(loan);
                                }
                            }
                        }
                        budgetLeft -= budgetSpentThisRound;
                        priorityLoans = stillNeedingExtra;
                        if (budgetSpentThisRound < 0.01) break; 
                    }
                } else if (strategyType === 'smart' || strategyType === 'highest_interest') {
                    if (strategyType === 'smart') {
                        moneyLenderLoans.sort((a, b) => b.rdInterestRate - a.rdInterestRate);
                        bankLoans.sort((a, b) => b.roi - a.roi);
                    } else {
                        bankLoans.sort((a, b) => b.currentMonthInterest - a.currentMonthInterest);
                    }

                    for (let loan of moneyLenderLoans) {
                        if (budgetLeft <= 0) break;
                        loan.rdToAdd = (loan.rdToAdd || 0) + budgetLeft;
                        budgetLeft = 0;
                    }

                    for (let loan of bankLoans) {
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
                }
            }
        } else {
            for (let loan of activeLoans) {
                if (loan.remaining > 0) {
                    if (loan.loanType === 'moneyLender') {
                        loan.currentMonthInterest = loan.monthlyInterest;
                        loan.currentMonthPayment = loan.payment;
                    } else {
                        let interest = loan.remaining * (loan.roi / 12 / 100);
                        loan.currentMonthInterest = interest;
                        loan.currentMonthPayment = (loan.remaining + interest <= loan.payment) ? loan.remaining + interest : loan.payment;
                    }
                }
            }
        }

        let anyLoanActive = false;
        activeLoans.forEach(loan => {
            if (loan.remaining > 0) {
                anyLoanActive = true;
                
                if (loan.loanType === 'moneyLender') {
                    let interest = loan.currentMonthInterest;
                    let interestPayment = Math.min(loan.currentMonthPayment, interest);
                    let rdAddition = loan.currentMonthPayment - interestPayment + (loan.rdToAdd || 0);
                    
                    loan.rdBalance += rdAddition;
                    loan.rdBalance += (loan.rdBalance * loan.rdInterestRate / 12 / 100);
                    
                    let principalPaid = 0;
                    let note = '';
                    if (loan.rdBalance >= loan.minimumLumpsum) {
                        principalPaid = loan.minimumLumpsum;
                        loan.remaining -= principalPaid;
                        loan.rdBalance -= principalPaid;
                        note = `RD Milestone reached: ₹${principalPaid.toLocaleString('en-IN')} paid towards principal`;
                        if (loan.remaining < 0.01) loan.remaining = 0;
                    }
                    
                    let totalPayment = interestPayment + rdAddition + principalPaid;
                    let opening = loan.remaining + principalPaid;
                    
                    monthData.loans[loan.id] = {
                        opening: opening.toFixed(2),
                        interest: interestPayment.toFixed(2),
                        principalPaid: principalPaid.toFixed(2),
                        rdAddition: rdAddition.toFixed(2),
                        rdBalance: loan.rdBalance.toFixed(2),
                        totalPayment: totalPayment.toFixed(2),
                        closing: loan.remaining.toFixed(2),
                        note: note,
                        loanType: 'moneyLender'
                    };
                    
                    monthData.combined.opening += opening;
                    monthData.combined.interest += interestPayment;
                    monthData.combined.principalPaid += principalPaid;
                    monthData.combined.totalPayment += totalPayment;
                    monthData.combined.closing += loan.remaining;
                } else {
                    let interest = loan.currentMonthInterest;
                    let principalPaid = loan.currentMonthPayment - interest;
                    let totalPayment = loan.currentMonthPayment;
                    let opening = loan.remaining;
                    
                    loan.remaining -= principalPaid;
                    if(loan.remaining < 0.01) loan.remaining = 0;

                    monthData.loans[loan.id] = {
                        opening: opening.toFixed(2),
                        interest: interest.toFixed(2),
                        principalPaid: principalPaid.toFixed(2),
                        totalPayment: totalPayment.toFixed(2),
                        closing: loan.remaining.toFixed(2),
                        loanType: 'bank'
                    };
                    
                    monthData.combined.opening += opening;
                    monthData.combined.interest += interest;
                    monthData.combined.principalPaid += principalPaid;
                    monthData.combined.totalPayment += totalPayment;
                    monthData.combined.closing += loan.remaining;
                }
            } else {
                monthData.loans[loan.id] = {
                    opening: "0.00",
                    interest: "0.00",
                    principalPaid: "0.00",
                    totalPayment: "0.00",
                    closing: "0.00",
                    loanType: loan.loanType
                };
            }
        });

        if (!anyLoanActive) {
            isFinished = true;
        } else {
            monthData.combined.opening = monthData.combined.opening.toFixed(2);
            monthData.combined.interest = monthData.combined.interest.toFixed(2);
            monthData.combined.principalPaid = monthData.combined.principalPaid.toFixed(2);
            monthData.combined.totalPayment = monthData.combined.totalPayment.toFixed(2);
            monthData.combined.closing = monthData.combined.closing.toFixed(2);
            
            schedule.push(monthData);
            currentMonth++;
            if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        }
        
        for (let loan of activeLoans) {
            loan.rdToAdd = 0;
        }
    }

    if (safetyCounter >= 1200) return { error: "Calculation exceeded 100 years. Please check your inputs." };
    return { error: null, schedule: schedule };
}

function summarizeSchedule(schedule, config) {
    const now = new Date();
    const currentAbsoluteMonth = (now.getFullYear() * 12) + now.getMonth();
    
    let data = { combined: { paid: 0, remain: 0, total: 0, date: '', principal: 0 }, loans: {} };
    config.loans.forEach(l => { 
        data.loans[l.id] = { name: l.name, paid: 0, remain: 0, total: 0, date: '', principal: l.principal }; 
        data.combined.principal += l.principal;
    });

    schedule.forEach(row => {
        const rowAbsoluteMonth = (row.year * 12) + row.month;
        const isPast = rowAbsoluteMonth <= currentAbsoluteMonth;
        
        const cInt = parseFloat(row.combined.interest);
        if (cInt > 0 || parseFloat(row.combined.opening) > 0) {
            data.combined.total += cInt;
            if (isPast) data.combined.paid += cInt; else data.combined.remain += cInt;
            data.combined.date = row.dateString;
        }

        config.loans.forEach(l => {
            const lData = row.loans[l.id];
            if (lData && parseFloat(lData.opening) > 0) {
                const lInt = parseFloat(lData.interest);
                data.loans[l.id].total += lInt;
                if (isPast) data.loans[l.id].paid += lInt; else data.loans[l.id].remain += lInt;
                data.loans[l.id].date = row.dateString;
            }
        });
    });
    return data;
}

// Helper to convert "Jan 2026" to absolute months for subtraction
function parseMonthYear(dateStr) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const parts = dateStr.split(' ');
    if (parts.length !== 2) return 0;
    return (parseInt(parts[1]) * 12) + months.indexOf(parts[0]);
}

function formatDiff(diffMonths) {
    if (diffMonths <= 0) return '';
    const y = Math.floor(diffMonths / 12);
    const m = diffMonths % 12;
    let res = [];
    if (y > 0) res.push(`${y} year${y>1?'s':''}`);
    if (m > 0) res.push(`${m} month${m>1?'s':''}`);
    return res.join(', ');
}

function renderSummaries() {
    const fmt = (num) => Number(num.toFixed(2)).toLocaleString('en-IN');
    const selectedStrategy = appState.config.global.strategy;
    const summaryData = appState.simulations[selectedStrategy];
    const baseSummary = appState.baselineSummary;

    if (!baseSummary || !summaryData) {
        console.error('Missing summary data', { baseSummary, summaryData });
        return;
    }

    // Build the dynamic pills for the OTHER strategies
    let pillsHTML = '';
    const currentTotal = summaryData.combined.total;

    Object.keys(STRATEGY_NAMES).forEach(key => {
        if (key !== selectedStrategy && appState.simulations[key]) {
            const altTotal = appState.simulations[key].combined.total;
            const diff = currentTotal - altTotal; 
            
            let resultText = `Cost is identical`;
            let colorClass = ``;

            if (Math.abs(diff) > 0.1) {
                const percent = ((Math.abs(diff) / currentTotal) * 100).toFixed(2);
                if (diff > 0) {
                    resultText = `You save ₹${fmt(Math.abs(diff))} (${percent}%)`;
                    colorClass = `success-text`;
                } else {
                    resultText = `You lose ₹${fmt(Math.abs(diff))} (${percent}%)`;
                    colorClass = `error-text`;
                }
            }

            pillsHTML += `
                <div class="comparison-pill">
                    <span class="pill-title">If you used ${STRATEGY_NAMES[key]}:</span>
                    <span class="${colorClass}">${resultText}</span>
                    <div style="font-size:0.75rem; color:#888; margin-top:0.2rem;">Finishes: ${appState.simulations[key].combined.date}</div>
                </div>
            `;
        }
    });

    const comparisonSection = `
        <div class="comparisons-container">
            <h4>Comparing to other strategies for your information:</h4>
            <div class="sub-text" style="margin-bottom: 0.75rem;">(Based on your currently entered payments and budget)</div>
            <div class="pill-grid">
                ${pillsHTML}
            </div>
        </div>
    `;

    const combinedPercentLost = summaryData.combined.principal > 0 ? ((summaryData.combined.total / summaryData.combined.principal) * 100).toFixed(1) : 0;

    // Calculate Savings vs Base Bank EMI
    const timeDiffMonths = parseMonthYear(baseSummary.combined.date) - parseMonthYear(summaryData.combined.date);
    const timeSavedStr = timeDiffMonths > 0 ? `(Closed ${formatDiff(timeDiffMonths)} earlier)` : '';
    
    const moneySaved = baseSummary.combined.total - summaryData.combined.total;
    let moneySavedStr = '';
    if (moneySaved > 0.1) {
        const moneySavedPct = ((moneySaved / baseSummary.combined.total) * 100).toFixed(1);
        moneySavedStr = `<span class="success-text">(Saved ₹${fmt(moneySaved)} / -${moneySavedPct}%)</span>`;
    }

    const container = document.getElementById('portfolioSummaryContainer');
    const combinedHTML = `
        <div class="summary-block combined-summary">
            <h3>Combined Portfolio</h3>
            
            <div class="summary-stats">
                <p><strong>Debt-Free Date:</strong> <del>${baseSummary.combined.date}</del> <strong>${summaryData.combined.date}</strong> <span class="success-text">${timeSavedStr}</span></p>
                <div class="base-comparison-note">
                    <p><strong>Overall Interest:</strong> <del>₹${fmt(baseSummary.combined.total)}</del> <strong>₹${fmt(summaryData.combined.total)}</strong> ${moneySavedStr}</p>
                    <p>Interest Already Paid: ₹${fmt(summaryData.combined.paid)}</p>
                    <p>Interest To Be Paid: ₹${fmt(summaryData.combined.remain)}</p>
                    <p class="highlight" style="margin-top: 0.5rem; font-weight: 500;">Money Lost to Interest: ${combinedPercentLost}% of Principal</p>
                </div>
            </div>
            ${comparisonSection}
        </div>
    `;

    let individualHTML = '<div class="individual-summaries-grid">';
    appState.config.loans.forEach(l => {
        const d = summaryData.loans[l.id];
        const b = baseSummary.loans[l.id]; // baseline individual
        const percentLost = d.principal > 0 ? ((d.total / d.principal) * 100).toFixed(1) : 0;
        
        // Individual savings vs Base Bank EMI
        const lTimeDiffMonths = parseMonthYear(b.date) - parseMonthYear(d.date);
        const lTimeSavedStr = lTimeDiffMonths > 0 ? `<br><span class="success-text" style="font-size:0.85rem">(Closed ${formatDiff(lTimeDiffMonths)} earlier)</span>` : '';
        const lMoneySaved = b.total - d.total;
        let lMoneySavedStr = '';
        if (lMoneySaved > 0.1 && b.total > 0) {
            const lMoneySavedPct = ((lMoneySaved / b.total) * 100).toFixed(1);
            lMoneySavedStr = ` <span class="success-text" style="font-size:0.85rem">(Saved ₹${fmt(lMoneySaved)} / -${lMoneySavedPct}%)</span>`;
        }

        individualHTML += `
            <div class="summary-block individual-summary">
                <h4>${d.name}</h4>
                <div class="summary-stats">
                    <p>Ends: <del>${b.date}</del> <strong>${d.date}</strong> ${lTimeSavedStr}</p>
                    <p style="margin-top:0.5rem"><strong>Total Int:</strong> <del>₹${fmt(b.total)}</del> <strong>₹${fmt(d.total)}</strong> ${lMoneySavedStr}</p>
                    <p>Paid so far: ₹${fmt(d.paid)}</p>
                    <p>Remaining Int: ₹${fmt(d.remain)}</p>
                    <p class="highlight" style="margin-top: 0.5rem; font-weight: 500;">Lost: ${percentLost}% of Principal</p>
                </div>
            </div>
        `;
    });
    individualHTML += '</div>';

    container.innerHTML = combinedHTML + individualHTML;
}

function renderTable() {
    if(appState.schedule.length === 0) return;
    
    const viewId = document.getElementById('viewSelector').value;
    const tbody = document.getElementById('scheduleBody');
    const thead = document.querySelector('#scheduleTable thead tr');
    tbody.innerHTML = '';
    
    const now = new Date();
    const currentAbsoluteMonth = (now.getFullYear() * 12) + now.getMonth();

    let isMoneyLender = false;
    if (viewId !== 'combined') {
        const loanConfig = appState.config.loans.find(l => l.id === viewId);
        isMoneyLender = loanConfig && loanConfig.loanType === 'moneyLender';
    }

    updateTableHeaders(isMoneyLender);

    appState.schedule.forEach(row => {
        const tr = document.createElement('tr');
        const rowAbsoluteMonth = (row.year * 12) + row.month;
        
        let displayData = viewId === 'combined' ? row.combined : row.loans[viewId];
        
        if (viewId !== 'combined' && parseFloat(displayData.opening) === 0) return;
        if (rowAbsoluteMonth <= currentAbsoluteMonth) tr.classList.add('past-row');

        if (isMoneyLender) {
            tr.innerHTML = `
                <td>${row.dateString}</td>
                <td>₹${Number(displayData.opening).toLocaleString('en-IN')}</td>
                <td>₹${Number(displayData.interest).toLocaleString('en-IN')}</td>
                <td>₹${Number(displayData.rdAddition || 0).toLocaleString('en-IN')}</td>
                <td>₹${Number(displayData.rdBalance || 0).toLocaleString('en-IN')}</td>
                <td>₹${Number(displayData.principalPaid).toLocaleString('en-IN')}</td>
                <td><strong>₹${Number(displayData.totalPayment).toLocaleString('en-IN')}</strong></td>
                <td>₹${Number(displayData.closing).toLocaleString('en-IN')}</td>
                <td>${displayData.note || ''}</td>
            `;
        } else {
            tr.innerHTML = `
                <td>${row.dateString}</td>
                <td>₹${Number(displayData.opening).toLocaleString('en-IN')}</td>
                <td>₹${Number(displayData.interest).toLocaleString('en-IN')}</td>
                <td>₹${Number(displayData.principalPaid).toLocaleString('en-IN')}</td>
                <td><strong>₹${Number(displayData.totalPayment).toLocaleString('en-IN')}</strong></td>
                <td>₹${Number(displayData.closing).toLocaleString('en-IN')}</td>
            `;
        }
        tbody.appendChild(tr);
    });
}

function updateTableHeaders(isMoneyLender) {
    const thead = document.querySelector('#scheduleTable thead tr');
    if (isMoneyLender) {
        thead.innerHTML = `
            <th>Date</th>
            <th>Opening Principal</th>
            <th>Interest Payment</th>
            <th>RD/SB Addition</th>
            <th>RD/SB Balance</th>
            <th>Principal Paid</th>
            <th>Total Payment</th>
            <th>Closing Principal</th>
            <th>Note</th>
        `;
    } else {
        thead.innerHTML = `
            <th>Date</th>
            <th>Opening Principal</th>
            <th>Interest Portion</th>
            <th>Principal Portion</th>
            <th>Total Payment</th>
            <th>Closing Principal</th>
        `;
    }
}

function showError(message) {
    const errorMsg = document.getElementById('error-message');
    document.getElementById('results').classList.add('hidden');
    errorMsg.textContent = message;
    errorMsg.classList.remove('hidden');
}

function exportJSON() {
    const config = gatherInputs();
    const pad = (num) => String(num).padStart(2, '0');
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    
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
                updateMinBudgetDisplay();
                handleCalculate();
            } else {
                addLoanCard(); 
            }
        } catch (error) {
            alert("Invalid JSON file: " + error.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function downloadCSV() {
    if (appState.schedule.length === 0) return;

    let csvRows = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    let headerRow = ["Config Key", "Config Value", "", "COMBINED Date", "Opening Principal", "Interest Portion", "Principal Portion", "Total Payment", "Closing Principal"];
    appState.config.loans.forEach(loan => {
        if (loan.loanType === 'moneyLender') {
            headerRow.push("", `${loan.name.toUpperCase()} Date`, "Opening Principal", "Interest Payment", "RD/SB Addition", "RD/SB Balance", "Principal Paid", "Total Payment", "Closing Principal", "Note");
        } else {
            headerRow.push("", `${loan.name.toUpperCase()} Date`, "Opening Principal", "Interest Portion", "Principal Portion", "Total Payment", "Closing Principal");
        }
    });
    csvRows.push(headerRow);

    let configData = [
        ["Start Month", monthNames[appState.config.global.startMonth]],
        ["Start Year", appState.config.global.startYear],
        ["Strategy", document.getElementById('strategyMode').options[document.getElementById('strategyMode').selectedIndex].text],
    ];
    if (appState.config.global.strategy !== 'manual') {
        configData.push(["Total Budget", appState.config.global.totalBudget]);
    } 
    appState.config.loans.forEach(loan => {
        if (loan.loanType === 'moneyLender') {
            configData.push([`${loan.name} Monthly Interest`, loan.monthlyInterest]);
            configData.push([`${loan.name} Min Lumpsum`, loan.minimumLumpsum]);
            configData.push([`${loan.name} RD Rate`, loan.rdInterestRate]);
            configData.push([`${loan.name} Total Payment`, loan.payment]);
            configData.push([`${loan.name} Principal`, loan.principal]);
        } else {
            configData.push([`${loan.name} Bank EMI`, loan.bankEmi]);
            configData.push([`${loan.name} Planned Payment`, loan.payment]);
            configData.push([`${loan.name} Principal`, loan.principal]);
            configData.push([`${loan.name} ROI`, loan.roi]);
        }
    });

    const maxRows = Math.max(configData.length, appState.schedule.length);

    for (let i = 0; i < maxRows; i++) {
        let row = [];
        if (i < configData.length) row.push(configData[i][0], configData[i][1]);
        else row.push("", "");
        
        row.push(""); 

        if (i < appState.schedule.length) {
            const month = appState.schedule[i];
            row.push(month.dateString, month.combined.opening, month.combined.interest, month.combined.principalPaid, month.combined.totalPayment, month.combined.closing);
            appState.config.loans.forEach(loanConfig => {
                row.push(""); 
                const lData = month.loans[loanConfig.id];
                if (lData) {
                    if (loanConfig.loanType === 'moneyLender') {
                        row.push(month.dateString, lData.opening, lData.interest, lData.rdAddition || 0, lData.rdBalance || 0, lData.principalPaid, lData.totalPayment, lData.closing, lData.note || "");
                    } else {
                        row.push(month.dateString, lData.opening, lData.interest, lData.principalPaid, lData.totalPayment, lData.closing);
                    }
                } else {
                    if (loanConfig.loanType === 'moneyLender') {
                        row.push("", "", "", "", "", "", "", "", "");
                    } else {
                        row.push("", "", "", "", "", "");
                    }
                }
            });
        } else {
            row.push("", "", "", "", "", "");
            appState.config.loans.forEach(loanConfig => {
                row.push(""); 
                if (loanConfig.loanType === 'moneyLender') {
                    row.push("", "", "", "", "", "", "", "", "");
                } else {
                    row.push("", "", "", "", "", "");
                }
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

    const pad = (num) => String(num).padStart(2, '0');
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    
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
