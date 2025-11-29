/**
 * Bug Reporting UI Controller
 * Handles all UI interactions for bug reporting
 */

(function () {
  if (!window || !window.BugReportService) {
    console.error('Bug Report UI: BugReportService not available');
    return;
  }

  const service = window.BugReportService;
  let isSubmitting = false;

  // ==================== INITIALIZATION ====================

  async function initBugReporter() {
    try {
      await service.initialize();
      setupEventListeners();
      renderSeverityOptions();
      renderCategoryOptions();
      console.log('Bug Reporter UI initialized');
    } catch (error) {
      console.error('Failed to initialize Bug Reporter UI:', error);
      showError('Failed to initialize bug reporter');
    }
  }

  function setupEventListeners() {
    // Form submission
    const submitBtn = document.getElementById('bugSubmitBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', handleSubmitBugReport);
    }

    // Clear form
    const clearBtn = document.getElementById('bugClearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', handleClearForm);
    }

    // Submit another bug
    const submitAnotherBtn = document.getElementById('bugSubmitAnotherBtn');
    if (submitAnotherBtn) {
      submitAnotherBtn.addEventListener('click', handleSubmitAnother);
    }

    // Character counter for description
    const descriptionInput = document.getElementById('bugDescription');
    if (descriptionInput) {
      descriptionInput.addEventListener('input', updateCharacterCount);
    }
  }

  function renderSeverityOptions() {
    const container = document.getElementById('bugSeverityOptions');
    if (!container) return;

    const severityLevels = service.getSeverityLevels();
    container.innerHTML = severityLevels.map((severity, index) => `
      <div class="bug-severity-option">
        <input 
          type="radio" 
          id="severity-${severity.value}" 
          name="severity" 
          value="${severity.value}" 
          class="bug-severity-radio"
          ${index === 2 ? 'checked' : ''}
        />
        <label for="severity-${severity.value}" class="bug-severity-label">
          <span class="bug-severity-icon">${severity.icon}</span>
          <span class="bug-severity-text">${severity.label}</span>
        </label>
      </div>
    `).join('');
  }

  function renderCategoryOptions() {
    const container = document.getElementById('bugCategoryGrid');
    if (!container) return;

    const categories = service.getCategories();
    container.innerHTML = categories.map((category, index) => `
      <div class="bug-category-option">
        <input 
          type="radio" 
          id="category-${category.value}" 
          name="category" 
          value="${category.value}" 
          class="bug-category-radio"
          ${index === 0 ? 'checked' : ''}
        />
        <label for="category-${category.value}" class="bug-category-label">
          <span class="bug-category-icon">${category.icon}</span>
          <span class="bug-category-text">${category.label}</span>
        </label>
      </div>
    `).join('');
  }

  // ==================== EVENT HANDLERS ====================

  async function handleSubmitBugReport() {
    if (isSubmitting) return;

    // Clear previous errors
    hideError();

    // Get form data
    const bugData = getFormData();

    // Validate
    const validation = validateBugReport(bugData);
    if (!validation.valid) {
      showError(validation.error);
      return;
    }

    // Submit
    try {
      isSubmitting = true;
      updateSubmitButton(true);

      const result = await service.submitBugReport(bugData);

      if (result.success) {
        showSuccessMessage();
        clearForm();
      } else {
        showError(result.error || 'Failed to submit bug report. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting bug report:', error);
      showError('An unexpected error occurred. Please try again.');
    } finally {
      isSubmitting = false;
      updateSubmitButton(false);
    }
  }

  function handleClearForm() {
    if (confirm('Are you sure you want to clear the form? All entered data will be lost.')) {
      clearForm();
    }
  }

  function handleSubmitAnother() {
    hideSuccessMessage();
  }

  function updateCharacterCount() {
    const descriptionInput = document.getElementById('bugDescription');
    const counter = document.getElementById('bugDescriptionCounter');
    
    if (!descriptionInput || !counter) return;

    const currentLength = descriptionInput.value.length;
    const maxLength = 2000;
    
    counter.textContent = `${currentLength}/${maxLength} characters`;
    
    if (currentLength > maxLength * 0.9) {
      counter.style.color = '#ef4444';
    } else {
      counter.style.color = 'var(--muted)';
    }
  }

  // ==================== FORM HANDLING ====================

  function getFormData() {
    const currentUserInfo = getSession ? getSession() : null;
    
    return {
      title: document.getElementById('bugTitle')?.value || '',
      description: document.getElementById('bugDescription')?.value || '',
      severity: document.querySelector('input[name="severity"]:checked')?.value || 'Medium',
      category: document.querySelector('input[name="category"]:checked')?.value || 'General',
      stepsToReproduce: document.getElementById('bugStepsToReproduce')?.value || '',
      expectedBehavior: document.getElementById('bugExpectedBehavior')?.value || '',
      actualBehavior: document.getElementById('bugActualBehavior')?.value || '',
      userEmail: document.getElementById('bugUserEmail')?.value || '',
      userName: currentUserInfo ? currentUserInfo.username : 'Anonymous'
    };
  }

  function validateBugReport(bugData) {
    if (!bugData.title || bugData.title.trim().length === 0) {
      return { valid: false, error: 'Please enter a bug title' };
    }

    if (bugData.title.length < 5) {
      return { valid: false, error: 'Bug title must be at least 5 characters long' };
    }

    if (!bugData.description || bugData.description.trim().length === 0) {
      return { valid: false, error: 'Please enter a bug description' };
    }

    if (bugData.description.length < 20) {
      return { valid: false, error: 'Bug description must be at least 20 characters long' };
    }

    if (bugData.userEmail && !service.isValidEmail(bugData.userEmail)) {
      return { valid: false, error: 'Please enter a valid email address' };
    }

    return { valid: true };
  }

  function clearForm() {
    document.getElementById('bugTitle').value = '';
    document.getElementById('bugDescription').value = '';
    document.getElementById('bugStepsToReproduce').value = '';
    document.getElementById('bugExpectedBehavior').value = '';
    document.getElementById('bugActualBehavior').value = '';
    document.getElementById('bugUserEmail').value = '';
    
    // Reset to default severity (Medium)
    const mediumRadio = document.querySelector('input[name="severity"][value="Medium"]');
    if (mediumRadio) mediumRadio.checked = true;
    
    // Reset to default category (UI/UX)
    const firstCategory = document.querySelector('input[name="category"]');
    if (firstCategory) firstCategory.checked = true;

    updateCharacterCount();
    hideError();
  }

  // ==================== UI UPDATES ====================

  function updateSubmitButton(loading) {
    const submitBtn = document.getElementById('bugSubmitBtn');
    if (!submitBtn) return;

    if (loading) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="animation: spin 1s linear infinite; margin-right: 8px;">
          <line x1="12" y1="2" x2="12" y2="6"></line>
          <line x1="12" y1="18" x2="12" y2="22"></line>
          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
          <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
          <line x1="2" y1="12" x2="6" y2="12"></line>
          <line x1="18" y1="12" x2="22" y2="12"></line>
          <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
          <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
        </svg>
        Submitting...
      `;
    } else {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
        Submit Bug Report
      `;
    }
  }

  function showError(message) {
    const errorContainer = document.getElementById('bugErrorMessage');
    if (!errorContainer) return;

    errorContainer.innerHTML = `
      <svg class="bug-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span class="bug-error-text">${message}</span>
    `;
    errorContainer.style.display = 'flex';

    // Scroll to error
    errorContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideError() {
    const errorContainer = document.getElementById('bugErrorMessage');
    if (errorContainer) {
      errorContainer.style.display = 'none';
    }
  }

  function showSuccessMessage() {
    const formContainer = document.getElementById('bugReportFormContainer');
    const successContainer = document.getElementById('bugSuccessContainer');
    
    if (formContainer) formContainer.style.display = 'none';
    if (successContainer) successContainer.style.display = 'block';

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function hideSuccessMessage() {
    const formContainer = document.getElementById('bugReportFormContainer');
    const successContainer = document.getElementById('bugSuccessContainer');
    
    if (formContainer) formContainer.style.display = 'block';
    if (successContainer) successContainer.style.display = 'none';
  }

  // ==================== EXPORT ====================

  window.BugReporterUI = {
    init: initBugReporter,
    clearForm: clearForm,
    showError: showError,
    hideError: hideError
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBugReporter);
  } else {
    initBugReporter();
  }
})();
