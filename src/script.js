document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Defaults
    const now = new Date();
    document.getElementById('startMonth').value = now.getMonth();
    document.getElementById('startYear').value = now.getFullYear();

    // 2. Theme Toggling
    const themeToggleBtn = document.getElementById('themeToggle');
    themeToggleBtn.addEventListener('click', () => {
        const html = document.documentElement;
        if (html.getAttribute('data-theme') === 'light') {
            html.setAttribute('data-theme', 'dark');
        } else {
            html.setAttribute('data-theme', 'light');
        }
    });

    // 3. Calculation Logic
    const calculateBtn = document.getElementById('calculateBtn');
    calculateBtn.addEventListener('click', calculateSchedule);
});

function calculateSchedule() {
    const principalInput = parseFloat(document.getElementById('principal').value);
    const roiInput = parseFloat(document.getElementById('roi').value);
    const paymentInput = parseFloat(document.getElementById('payment').value);
    let currentMonth = parseInt(document.getElementById('startMonth').value);
    let currentYear = parseInt(document.getElementById('startYear').value);
    
    const errorMsg = document.getElementById('error-message');
    const resultsSection = document.getElementById('results');
    
    // Basic validation
    if (isNaN(principalInput) || isNaN(roiInput) || isNaN(paymentInput)) {
        showError("Please fill in all numerical fields.");
        return;
    }

    const monthlyInterestRate = roiInput / 12 / 100;
    const firstMonthInterest = principalInput * monthlyInterestRate;

    // Core Check: Will the payment ever close the loan?
    if (paymentInput <= firstMonthInterest) {
        showError(`Your payment (₹${paymentInput.toFixed(2)}) is less than or equal to the first month's interest (₹${firstMonthInterest.toFixed(2)}). The loan will never close.`);
        return;
    }

    errorMsg.classList.add('hidden');
    resultsSection.classList.remove('hidden');

    let remainingPrincipal = principalInput;
    let schedule = []; // Array of objects designed for easy JSON/CSV export later
    let totalInterestPaid = 0;

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // Amortization Loop
    while (remainingPrincipal > 0) {
        let interestForMonth = remainingPrincipal * monthlyInterestRate;
        let principalPaidForMonth = paymentInput - interestForMonth;
        let paymentForMonth = paymentInput;

        // Final month logic
        if (remainingPrincipal + interestForMonth <= paymentInput) {
            paymentForMonth = remainingPrincipal + interestForMonth;
            principalPaidForMonth = remainingPrincipal;
        }

        let openingPrincipal = remainingPrincipal;
        remainingPrincipal -= principalPaidForMonth;
        totalInterestPaid += interestForMonth;

        schedule.push({
            date: `${monthNames[currentMonth]} ${currentYear}`,
            openingPrincipal: openingPrincipal.toFixed(2),
            interest: interestForMonth.toFixed(2),
            principalPaid: principalPaidForMonth.toFixed(2),
            closingPrincipal: Math.abs(remainingPrincipal).toFixed(2) // Math.abs handles floating point zero issues
        });

        // Increment Date
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
    }

    renderTable(schedule, totalInterestPaid);
}

function renderTable(schedule, totalInterestPaid) {
    const tbody = document.getElementById('scheduleBody');
    tbody.innerHTML = ''; // Clear previous

    schedule.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.date}</td>
            <td>₹${Number(row.openingPrincipal).toLocaleString('en-IN')}</td>
            <td>₹${Number(row.interest).toLocaleString('en-IN')}</td>
            <td>₹${Number(row.principalPaid).toLocaleString('en-IN')}</td>
            <td>₹${Number(row.closingPrincipal).toLocaleString('en-IN')}</td>
        `;
        tbody.appendChild(tr);
    });

    // Update Summary
    const finalDate = schedule[schedule.length - 1].date;
    document.getElementById('closureDate').textContent = finalDate;
    document.getElementById('totalInterest').textContent = Number(totalInterestPaid.toFixed(2)).toLocaleString('en-IN');
}

function showError(message) {
    const errorMsg = document.getElementById('error-message');
    const resultsSection = document.getElementById('results');
    
    errorMsg.textContent = message;
    errorMsg.classList.remove('hidden');
    resultsSection.classList.add('hidden');
}
