// Global State for exports
let appState = {
    config: {},
    schedule: []
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
    let totalInterestPaid = 0;
    
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
        totalInterestPaid += interestForMonth;

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

    // Get current real-world date to check progress
    const now = new Date();
    const currentRealYear = now.getFullYear();
    const currentRealMonth = now.getMonth();

    let interestAlreadyPaid = 0;
    let interestToBePaid = 0;
    let overallInterestPaid = 0;

    schedule.forEach(row => {
        const tr = document.createElement('tr');
        const rowInterest = parseFloat(row.interest);
        
        overallInterestPaid += rowInterest;
        
        // Highlight logic and interest splitting
        if (row.year < currentRealYear || (row.year === currentRealYear && row.month <= currentRealMonth)) {
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
    
    // Update the new breakdown UI
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

// --- Import / Export Features ---

function exportJSON() {
    // Only export if we have valid configs in the inputs
    const currentInputs = {
        principal: document.getElementById('principal').value,
        roi: document.getElementById('roi').value,
        payment: document.getElementById('payment').value,
        startMonth: document.getElementById('startMonth').value,
        startYear: document.getElementById('startYear').value
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentInputs, null, 2));
    triggerDownload(dataStr, "loan_config.json");
}

function importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const config = JSON.parse(e.target.result);
            if(config.principal) document.getElementById('principal').value = config.principal;
            if(config.roi) document.getElementById('roi').value = config.roi;
            if(config.payment) document.getElementById('payment').value = config.payment;
            if(config.startMonth) document.getElementById('startMonth').value = config.startMonth;
            if(config.startYear) document.getElementById('startYear').value = config.startYear;
            
            // Auto calculate after import if all main fields exist
            if(config.principal && config.roi && config.payment) {
                calculateSchedule();
            }
        } catch (error) {
            alert("Invalid JSON file");
        }
    };
    reader.readAsText(file);
    // Reset file input so the same file can be loaded again if needed
    event.target.value = '';
}

function downloadCSV() {
    if (appState.schedule.length === 0) return;

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    // Config setup mapped to an array for easy row building
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
    
    // Headers
    csvContent += "Configuration,Value,,Date,Opening Principal,Interest Portion,Principal Portion,Closing Principal\n";

    // Build Rows
    appState.schedule.forEach((row, index) => {
        let rowData = [];
        
        // Add config data for the first 5 rows, empty otherwise
        if (index < configLabels.length) {
            rowData.push(`"${configLabels[index]}"`, `"${configValues[index]}"`);
        } else {
            rowData.push("", "");
        }
        
        // Empty buffer column
        rowData.push(""); 

        // Add schedule data (using raw numbers, no commas, so spreadsheet software handles it natively)
        rowData.push(
            `"${row.dateString}"`, 
            row.openingPrincipal, 
            row.interest, 
            row.principalPaid, 
            row.closingPrincipal
        );

        csvContent += rowData.join(",") + "\n";
    });

    triggerDownload(csvContent, "loan_amortization_schedule.csv");
}

function triggerDownload(content, filename) {
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", content);
    downloadAnchorNode.setAttribute("download", filename);
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}
