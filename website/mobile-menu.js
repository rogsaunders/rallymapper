/**
 * RouteMapper Mobile Menu & Navigation
 * Handles mobile menu toggle, smooth scrolling, and accessibility
 */

(function() {
  'use strict';

  // ==========================================
  // MOBILE MENU TOGGLE
  // ==========================================
  
  const menuToggle = document.querySelector('.menu-toggle');
  const navMenu = document.querySelector('.nav-menu');
  const body = document.body;

  if (menuToggle && navMenu) {
    // Toggle menu on button click
    menuToggle.addEventListener('click', function() {
      const isOpen = navMenu.classList.contains('open');
      
      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    // Close menu when clicking on a navigation link
    const navLinks = navMenu.querySelectorAll('a');
    navLinks.forEach(link => {
      link.addEventListener('click', function(e) {
        // Only close menu for anchor links (not external pages)
        if (this.getAttribute('href').startsWith('#')) {
          closeMenu();
        }
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
      if (!navMenu.contains(e.target) && 
          !menuToggle.contains(e.target) && 
          navMenu.classList.contains('open')) {
        closeMenu();
      }
    });

    // Close menu on escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && navMenu.classList.contains('open')) {
        closeMenu();
        menuToggle.focus(); // Return focus to toggle button
      }
    });

    // Handle window resize
    let resizeTimer;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        // Close menu if window is resized to desktop size
        if (window.innerWidth > 768 && navMenu.classList.contains('open')) {
          closeMenu();
        }
      }, 250);
    });
  }

  function openMenu() {
    menuToggle.classList.add('active');
    menuToggle.setAttribute('aria-expanded', 'true');
    navMenu.classList.add('open');
    body.classList.add('menu-open');
    
    // Trap focus within menu
    trapFocus(navMenu);
  }

  function closeMenu() {
    menuToggle.classList.remove('active');
    menuToggle.setAttribute('aria-expanded', 'false');
    navMenu.classList.remove('open');
    body.classList.remove('menu-open');
  }

  // ==========================================
  // FOCUS TRAP FOR ACCESSIBILITY
  // ==========================================
  
  function trapFocus(element) {
    const focusableElements = element.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    function handleTabKey(e) {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    }

    element.addEventListener('keydown', handleTabKey);

    // Set focus to first element
    if (firstFocusable) {
      firstFocusable.focus();
    }
  }

  // ==========================================
  // SMOOTH SCROLLING FOR ANCHOR LINKS
  // ==========================================
  
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      
      // Skip if it's just "#" or empty
      if (!href || href === '#') return;
      
      const targetId = href.substring(1);
      const targetElement = document.getElementById(targetId);
      
      if (targetElement) {
        e.preventDefault();
        
        // Calculate offset for fixed header
        const headerHeight = document.querySelector('.nav').offsetHeight;
        const targetPosition = targetElement.offsetTop - headerHeight - 20;
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });

        // Update URL without jumping
        if (history.pushState) {
          history.pushState(null, null, href);
        }

        // Set focus to target for accessibility
        targetElement.setAttribute('tabindex', '-1');
        targetElement.focus();
      }
    });
  });

  // ==========================================
  // STICKY HEADER ON SCROLL
  // ==========================================
  
  const header = document.querySelector('.nav');
  let lastScroll = 0;

  window.addEventListener('scroll', function() {
    const currentScroll = window.pageYOffset;

    if (currentScroll <= 0) {
      header.classList.remove('scroll-up');
      header.classList.remove('scroll-down');
      return;
    }

    if (currentScroll > lastScroll && !header.classList.contains('scroll-down')) {
      // Scrolling down
      header.classList.remove('scroll-up');
      header.classList.add('scroll-down');
    } else if (currentScroll < lastScroll && header.classList.contains('scroll-down')) {
      // Scrolling up
      header.classList.remove('scroll-down');
      header.classList.add('scroll-up');
    }
    
    lastScroll = currentScroll;
  });

  // ==========================================
  // VIDEO AUTOPLAY ON SCROLL
  // ==========================================
  
  const videos = document.querySelectorAll('video[autoplay]');
  
  if ('IntersectionObserver' in window && videos.length > 0) {
    const videoObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.play();
        } else {
          entry.target.pause();
        }
      });
    }, {
      threshold: 0.5
    });

    videos.forEach(video => {
      videoObserver.observe(video);
    });
  }

  // ==========================================
  // FORM VALIDATION & FEEDBACK
  // ==========================================
  
  const forms = document.querySelectorAll('form[data-netlify]');
  
  forms.forEach(form => {
    form.addEventListener('submit', function(e) {
      const email = this.querySelector('input[type="email"]');
      const messageDiv = this.querySelector('.form-message');
      
      // Basic email validation
      if (email && !isValidEmail(email.value)) {
        e.preventDefault();
        showFormMessage(messageDiv, 'Please enter a valid email address.', 'error');
        return;
      }
      
      // Show success message (Netlify will handle the actual submission)
      // Note: This won't prevent Netlify's default behavior
    });
  });

  function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  function showFormMessage(element, message, type) {
    if (!element) return;
    
    element.textContent = message;
    element.classList.remove('success', 'error');
    element.classList.add(type);
    
    // Clear message after 5 seconds
    setTimeout(() => {
      element.textContent = '';
      element.classList.remove('success', 'error');
    }, 5000);
  }

  // ==========================================
  // LAZY LOADING FOR IMAGES
  // ==========================================
  
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          
          // Handle <img> tags
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }
          
          // Handle background images
          if (img.dataset.bgImage) {
            img.style.backgroundImage = `url('${img.dataset.bgImage}')`;
            img.removeAttribute('data-bg-image');
          }
          
          observer.unobserve(img);
        }
      });
    });

    // Observe all images with data-src or data-bg-image
    document.querySelectorAll('[data-src], [data-bg-image]').forEach(img => {
      imageObserver.observe(img);
    });
  }

  // ==========================================
  // ANIMATE ON SCROLL (OPTIONAL)
  // ==========================================
  
  function animateOnScroll() {
    const elements = document.querySelectorAll('.card, .tile, .testimonial');
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }
      });
    }, {
      threshold: 0.1
    });

    elements.forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      observer.observe(el);
    });
  }

  // Initialize animations when page loads
  if (window.innerWidth > 768) {
    // Only animate on larger screens for better mobile performance
    window.addEventListener('load', animateOnScroll);
  }

  // ==========================================
  // CONSOLE MESSAGE FOR DEVELOPERS
  // ==========================================
  
  console.log('%c👋 Hey Developer! ', 'background: #4ade80; color: #000; padding: 8px 16px; font-size: 14px; font-weight: bold;');
  console.log('%cInterested in RouteMapper\'s development? Contact us at hello@routemapper.net', 'color: #4ade80; font-size: 12px;');

})();
