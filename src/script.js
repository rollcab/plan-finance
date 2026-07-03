// Global State for exports
let appState = {
    config: {},
    schedule: [],
    baseFileName: "loan_config" // Added to track the active file name
};

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Defaults
    const now = new Date();
    document.getElementById('startMonth').value = now.getMonth();
    document.getElementById('startYear').value = now.getFullYear();

    // 2. Theme Toggling (Sun/Moon)
    const themeToggleBtn = document.getElementById('themeToggle');
    const sunIcon = document.getElementById('sunIcon');
    const moonIcon = document.getElementById('moonIcon');
    
    // Set initial icon based on HTML data-theme
    if(document.documentElement.getAttribute('data-theme') === 'dark') {
        sunIcon.classList.remove('hidden');
        moonIcon.classList.add('hidden');
    }

    themeToggleBtn.addEventListener('click', () => {
        const html = document.documentElement;
        if (html.getAttribute('data-theme') === 'light') {
            html.setAttribute('data-theme', 'dark');
            sunIcon.classList.remove('hidden');
            moonIcon.classList.add('hidden');
        } else {
            html.setAttribute('data-theme', 'light');
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
        }
    });

    // 3. Event Listeners
    document.getElementById('calculateBtn').addEventListener('click', calculateSchedule);
    document.getElementById('exportConfigBtn').addEventListener('click', exportJSON);
    document.getElementById('importConfig').addEventListener('change', importJSON);
    document.getElementById('downloadCsvBtn').addEventListener('click', downloadCSV);
});

function calculateSchedule() {
    const config = {
        principal: parseFloat(document.getElementById('principal').value),
        roi: parseFloat(document.getElementById('roi').value),
        payment: parseFloat(document.getElementById('payment').value),
        startMonth: parseInt(document.getElementById('startMonth').value),
        startYear: parseInt(document.getElementById('startYear').value)
    };
    
    const errorMsg = document.getElementById('error-message');
    const resultsSection = document.getElementById('results');
    
    if (isNaN(config.principal) || isNaN(config.roi) || isNaN(config.payment)) {
        showError("Please fill in all numerical fields.");
        return;
    }

    const monthlyInterestRate = config.roi / 12 / 100;
    const firstMonthInterest = config.principal * monthlyInterestRate;

    if (config.payment <= firstMonthInterest) {
        showError(`Your payment (₹${config.payment.toFixed(2)}) is less than or equal to the first month's interest (₹${firstMonthInterest.toFixed(2)}). The loan will never close.`);
        return;
    }

    errorMsg.classList.add('hidden');
    resultsSection.classList.remove('hidden');

    let remainingPrincipal = config.principal;
    let schedule = [];
    
    let currentMonth = config.startMonth;
    let currentYear = config.startYear;
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    while (remainingPrincipal > 0) {
        let interestForMonth = remainingPrincipal * monthlyInterestRate;
        let principalPaidForMonth = config.payment - interestForMonth;
        let paymentForMonth = config.payment;

        if (remainingPrincipal + interestForMonth <= config.payment) {
            paymentForMonth = remainingPrincipal + interestForMonth;
            principalPaidForMonth = remainingPrincipal;
        }

        let openingPrincipal = remainingPrincipal;
        remainingPrincipal -= principalPaidForMonth;

        schedule.push({
            dateString: `${monthNames[currentMonth]} ${currentYear}`,
            month: currentMonth,
            year: currentYear,
            openingPrincipal: openingPrincipal.toFixed(2),
            interest: interestForMonth.toFixed(2),
            principalPaid: principalPaidForMonth.toFixed(2),
            closingPrincipal: Math.abs(remainingPrincipal).toFixed(2)
        });

        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
    }

    // Save to global state for exports
    appState.config = config;
    appState.schedule = schedule;

    renderTable(schedule);
}

function renderTable(schedule) {
    const tbody = document.getElementById('scheduleBody');
    tbody.innerHTML = ''; 

    const now = new Date();
    const currentAbsoluteMonth = (now.getFullYear() * 12) + now.getMonth();

    let interestAlreadyPaid = 0;
    let interestToBePaid = 0;
    let overallInterestPaid = 0;

    schedule.forEach(row => {
        const tr = document.createElement('tr');
        const rowInterest = parseFloat(row.interest);
        const rowAbsoluteMonth = (row.year * 12) + row.month;
        
        overallInterestPaid += rowInterest;
        
        if (rowAbsoluteMonth <= currentAbsoluteMonth) {
            tr.classList.add('past-row');
            interestAlreadyPaid += rowInterest;
        } else {
            interestToBePaid += rowInterest;
        }

        tr.innerHTML = `
            <td>${row.dateString}</td>
            <td>₹${Number(row.openingPrincipal).toLocaleString('en-IN')}</td>
            <td>₹${Number(row.interest).toLocaleString('en-IN')}</td>
            <td>₹${Number(row.principalPaid).toLocaleString('en-IN')}</td>
            <td>₹${Number(row.closingPrincipal).toLocaleString('en-IN')}</td>
        `;
        tbody.appendChild(tr);
    });

    const finalDate = schedule[schedule.length - 1].dateString;
    document.getElementById('closureDate').textContent = finalDate;
    
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
    const currentInputs = {
        principal: document.getElementById('principal').value,
        roi: document.getElementById('roi').value,
        payment: document.getElementById('payment').value,
        startMonth: document.getElementById('startMonth').value,
        startYear: document.getElementById('startYear').value
    };
    
    // Construct the proposed filename
    const timestamp = getFormattedTimestamp();
    const suggestedFileName = `${appState.baseFileName}.${timestamp}.json`;
    
    // Prompt the user, fallback if they cancel
    const finalFileName = prompt("Save configuration as:", suggestedFileName);
    if (!finalFileName) return; // Abort if cancelled

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentInputs, null, 2));
    triggerDownload(dataStr, finalFileName);
}

function importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Capture the base filename (everything before the first dot)
    const rawFileName = file.name;
    if (rawFileName.includes('.')) {
        appState.baseFileName = rawFileName.split('.')[0];
    } else {
        appState.baseFileName = rawFileName; // Fallback if file has no extension
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const config = JSON.parse(e.target.result);
            if(config.principal) document.getElementById('principal').value = config.principal;
            if(config.roi) document.getElementById('roi').value = config.roi;
            if(config.payment) document.getElementById('payment').value = config.payment;
            if(config.startMonth) document.getElementById('startMonth').value = config.startMonth;
            if(config.startYear) document.getElementById('startYear').value = config.startYear;
            
            if(config.principal && config.roi && config.payment) {
                calculateSchedule();
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

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    const configLabels = [
        "Principal Pending", "Rate of Interest (%)", "Planned Monthly Payment", 
        "Starting Month", "Starting Year"
    ];
    const configValues = [
        appState.config.principal, 
        appState.config.roi, 
        appState.config.payment, 
        monthNames[appState.config.startMonth], 
        appState.config.startYear
    ];

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Configuration,Value,,Date,Opening Principal,Interest Portion,Principal Portion,Closing Principal\n";

    appState.schedule.forEach((row, index) => {
        let rowData = [];
        
        if (index < configLabels.length) {
            rowData.push(`"${configLabels[index]}"`, `"${configValues[index]}"`);
        } else {
            rowData.push("", "");
        }
        
        rowData.push(""); 

        rowData.push(
            `"${row.dateString}"`, 
            row.openingPrincipal, 
            row.interest, 
            row.principalPaid, 
            row.closingPrincipal
        );

        csvContent += rowData.join(",") + "\n";
    });

    const timestamp = getFormattedTimestamp();
    triggerDownload(csvContent, `${appState.baseFileName}_schedule.${timestamp}.csv`);
}

function triggerDownload(content, filename) {
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", content);
    downloadAnchorNode.setAttribute("download", filename);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}
