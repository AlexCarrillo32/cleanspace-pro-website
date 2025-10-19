document.addEventListener("DOMContentLoaded", function () {
  // Mobile menu toggle
  const hamburger = document.querySelector(".hamburger");
  const navMenu = document.querySelector(".nav-menu");

  hamburger.addEventListener("click", function () {
    hamburger.classList.toggle("active");
    navMenu.classList.toggle("active");
  });

  // Close mobile menu when clicking on a link
  document.querySelectorAll(".nav-menu a").forEach((link) => {
    link.addEventListener("click", function () {
      hamburger.classList.remove("active");
      navMenu.classList.remove("active");
    });
  });

  // Smooth scrolling for navigation links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute("href"));
      if (target) {
        const headerOffset = 70;
        const elementPosition = target.getBoundingClientRect().top;
        const offsetPosition =
          elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth",
        });
      }
    });
  });

  // Header background change on scroll
  const header = document.querySelector(".header");
  window.addEventListener("scroll", function () {
    if (window.scrollY > 100) {
      header.style.background = "rgba(255, 255, 255, 0.95)";
      header.style.backdropFilter = "blur(10px)";
    } else {
      header.style.background = "#fff";
      header.style.backdropFilter = "none";
    }
  });

  // Intersection Observer for fade-in animations
  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  const observer = new IntersectionObserver(function (entries) {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  }, observerOptions);

  // Add fade-in class to elements and observe them
  const animateElements = document.querySelectorAll(
    ".service-card, .feature, .stat, .contact-info, .contact-form",
  );
  animateElements.forEach((el) => {
    el.classList.add("fade-in");
    observer.observe(el);
  });

  // Form submission handling
  const contactForm = document.querySelector(".contact-form");
  contactForm.addEventListener("submit", function (e) {
    e.preventDefault();

    // Get form data
    const formData = new FormData(contactForm);
    const formObject = {};
    formData.forEach((value, key) => {
      formObject[key] = value;
    });

    // Basic form validation
    const requiredFields = ["name", "email", "phone", "service"];
    let isValid = true;

    requiredFields.forEach((field) => {
      const input = document.getElementById(field);
      if (!formObject[field] || formObject[field].trim() === "") {
        input.style.borderColor = "#ef4444";
        isValid = false;
      } else {
        input.style.borderColor = "#e2e8f0";
      }
    });

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emailInput = document.getElementById("email");
    if (formObject.email && !emailRegex.test(formObject.email)) {
      emailInput.style.borderColor = "#ef4444";
      isValid = false;
    }

    if (isValid) {
      // Send to backend API
      fetch("/api/inquiries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formObject.name,
          email: formObject.email,
          phone: formObject.phone,
          service_type: formObject.service,
          message: `Service request: ${formObject.service}`,
        }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            showNotification(
              "Thank you! We'll contact you soon for your free quote.",
              "success",
            );
            contactForm.reset();
          } else {
            showNotification(
              "Something went wrong. Please try again or call us directly.",
              "error",
            );
          }
        })
        .catch((error) => {
          console.error("Form submission error:", error);
          showNotification(
            "Unable to submit form. Please call us at (562) 440-9025.",
            "error",
          );
        });
    } else {
      showNotification(
        "Please fill in all required fields correctly.",
        "error",
      );
    }
  });

  // CTA button handlers
  document.querySelectorAll(".btn-primary").forEach((btn) => {
    btn.addEventListener("click", function () {
      if (this.textContent.includes("Quote")) {
        document.querySelector("#contact").scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  });

  document.querySelectorAll(".btn-secondary").forEach((btn) => {
    btn.addEventListener("click", function () {
      if (this.textContent.includes("Services")) {
        document.querySelector("#services").scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  });

  // Show notification function
  function showNotification(message, type) {
    // Remove existing notification
    const existingNotification = document.querySelector(".notification");
    if (existingNotification) {
      existingNotification.remove();
    }

    // Create notification element
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <span>${message}</span>
      <button class="notification-close">&times;</button>
    `;

    // Add styles
    notification.style.cssText = `
      position: fixed;
      top: 90px;
      right: 20px;
      background: ${type === "success" ? "#10b981" : "#ef4444"};
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      box-shadow: 0 5px 20px rgba(0,0,0,0.2);
      z-index: 1001;
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: 400px;
      animation: slideIn 0.3s ease;
    `;

    // Add close button styles
    const closeBtn = notification.querySelector(".notification-close");
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
      padding: 0;
      margin-left: 10px;
    `;

    // Add to document
    document.body.appendChild(notification);

    // Close functionality
    closeBtn.addEventListener("click", function () {
      notification.remove();
    });

    // Auto remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
  }

  // Add CSS animation for notification
  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);

  // Add hover effects to service cards
  document.querySelectorAll(".service-card").forEach((card) => {
    card.addEventListener("mouseenter", function () {
      this.style.transform = "translateY(-10px) scale(1.02)";
    });

    card.addEventListener("mouseleave", function () {
      this.style.transform = "translateY(0) scale(1)";
    });
  });

  // Stats counter animation
  function animateStats() {
    const stats = document.querySelectorAll(".stat-number");
    stats.forEach((stat) => {
      const target = parseInt(stat.textContent.replace(/\D/g, ""));
      const suffix = stat.textContent.replace(/\d/g, "");
      let current = 0;
      const increment = target / 50;
      const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
          current = target;
          clearInterval(timer);
        }
        stat.textContent = Math.floor(current) + suffix;
      }, 40);
    });
  }

  // Trigger stats animation when features section is visible
  const featuresSection = document.querySelector(".features");
  const statsObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateStats();
          statsObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 },
  );

  if (featuresSection) {
    statsObserver.observe(featuresSection);
  }

  // Add loading animation for images (placeholder for future image integration)
  document.querySelectorAll(".placeholder-image").forEach((placeholder) => {
    placeholder.style.animation = "pulse 2s infinite";
  });

  // Add pulse animation
  const pulseStyle = document.createElement("style");
  pulseStyle.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 0.7; }
      50% { opacity: 1; }
    }
  `;
  document.head.appendChild(pulseStyle);
});
