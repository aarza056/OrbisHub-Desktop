(function(){
  if (window.ToastManager) return;
  const ToastManager = {
    container: null,
    init() {
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
      }
    },
    show(title, message, type = 'info', duration = 5000) {
      this.init();
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      const icons = {
        success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
        error: '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
        warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
        info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'
      };
      toast.innerHTML = `
        <div class="toast-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${icons[type]}
          </svg>
        </div>
        <div class="toast-content">
          <div class="toast-title">${title}</div>
          <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>`;
      this.container.appendChild(toast);
      const closeBtn = toast.querySelector('.toast-close');
      closeBtn.addEventListener('click', () => this.remove(toast));
      if (duration > 0) {
        setTimeout(() => this.remove(toast), duration);
      }
      return toast;
    },
    remove(toast) {
      toast.style.animation = 'toast-slide-out 0.3s cubic-bezier(0.4, 0, 1, 1) forwards';
      setTimeout(() => { if (toast.parentElement) toast.remove(); }, 300);
    },
    success(title, message, duration) { return this.show(title, message, 'success', duration); },
    error(title, message, duration) { return this.show(title, message, 'error', duration); },
    warning(title, message, duration) { return this.show(title, message, 'warning', duration); },
    info(title, message, duration) { return this.show(title, message, 'info', duration); }
  };
  window.ToastManager = ToastManager;
})();