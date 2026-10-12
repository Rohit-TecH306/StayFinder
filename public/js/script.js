// THIS IS BASICALLY FOR THE FORM VALIDATION JS CODE FROM THE BOOTSRAP :-
// Example starter JavaScript for disabling form submissions if there are invalid fields
(function () {
  'use strict'

  // Fetch all the forms we want to apply custom Bootstrap validation styles to
  var forms = document.querySelectorAll('.needs-validation')

  // Loop over them and prevent submission
  Array.prototype.slice.call(forms)
    .forEach(function (form) {
      form.addEventListener('submit', function (event) {
        if (!form.checkValidity()) {
          event.preventDefault()
          event.stopPropagation()
          const firstInvalid = form.querySelector(':invalid')
          if (firstInvalid) {
            firstInvalid.focus({ preventScroll: true })
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }

        form.classList.add('was-validated')
      }, false)
    })
})()

// The two image controls submit the same field. Clear the alternate control so
// Multer receives exactly one image while offering distinct camera and browse actions.
const listingImageInputs = document.querySelectorAll("[data-listing-image-input]");
const imageSelectionMessage = document.querySelector("[data-image-selection-message]");

listingImageInputs.forEach(function (input) {
  input.addEventListener("change", function () {
    if (!input.files || input.files.length === 0) return;

    listingImageInputs.forEach(function (otherInput) {
      if (otherInput !== input) otherInput.value = "";
    });

    if (imageSelectionMessage) {
      imageSelectionMessage.textContent = `Selected: ${input.files[0].name}`;
    }
  });
});

const searchForm = document.querySelector("[data-search-form]");

if (searchForm) {
  const searchInput = searchForm.querySelector("[name='q']");
  const searchFeedback = searchForm.querySelector(".search-feedback");

  searchForm.addEventListener("submit", function (event) {
    const searchTerm = searchInput.value.trim();
    if (searchTerm) {
      searchInput.value = searchTerm;
      searchInput.removeAttribute("aria-invalid");
      if (searchFeedback) searchFeedback.textContent = "";
      return;
    }

    event.preventDefault();
    searchInput.setAttribute("aria-invalid", "true");
    if (searchFeedback) searchFeedback.textContent = "Enter a destination to search.";
    searchInput.focus();
  });

  searchInput.addEventListener("input", function () {
    if (searchInput.value.trim()) {
      searchInput.removeAttribute("aria-invalid");
      if (searchFeedback) searchFeedback.textContent = "";
    }
  });
}

const mapElement = document.querySelector("#map");

if (mapElement) {
  const longitude = Number(mapElement.dataset.longitude);
  const latitude = Number(mapElement.dataset.latitude);

  if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
    const map = L.map(mapElement).setView([latitude, longitude], 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    const popupContent = document.createElement("div");
    const title = document.createElement("strong");
    const location = document.createElement("p");

    title.textContent = mapElement.dataset.title;
    location.textContent = mapElement.dataset.location;
    popupContent.append(title, location);

    L.marker([latitude, longitude])
      .addTo(map)
      .bindPopup(popupContent)
      .openPopup();
  }
}


const cancelBookingForm = document.querySelector("#cancelBookingForm");
const cancelBookingModalElement = document.querySelector("#cancelBookingModal");
const confirmCancelBookingButton = document.querySelector("#confirmCancelBooking");

if (
    cancelBookingForm &&
    cancelBookingModalElement &&
    confirmCancelBookingButton
) {
    const cancelBookingModal = bootstrap.Modal.getOrCreateInstance(
        cancelBookingModalElement
    );

    let cancellationConfirmed = false;

    cancelBookingForm.addEventListener("submit", function (event) {
        if (!cancellationConfirmed) {
            event.preventDefault();
            cancelBookingModal.show();
        }
    });

    confirmCancelBookingButton.addEventListener("click", function () {
        cancellationConfirmed = true;
        cancelBookingForm.requestSubmit();
    });
}

document.addEventListener("click", function (event) {
    const toggleBtn = event.target.closest("[data-toggle-password]");
    if (!toggleBtn) return;

    const targetSelector = toggleBtn.getAttribute("data-toggle-password");
    const passwordInput = document.querySelector(targetSelector);
    if (!passwordInput) return;

    const isPassword = passwordInput.getAttribute("type") === "password";
    passwordInput.setAttribute("type", isPassword ? "text" : "password");

    const icon = toggleBtn.querySelector("i");
    if (icon) {
        icon.classList.toggle("fa-eye", !isPassword);
        icon.classList.toggle("fa-eye-slash", isPassword);
    }

    toggleBtn.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
});

// Back links always have a local fallback. Use history only when the browser
// actually came from another page on this site, so direct visits never leave
// the application or get trapped in a redirect loop.
document.addEventListener("click", function (event) {
    const backLink = event.target.closest("[data-site-back]");
    if (!backLink || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    try {
        const referrer = document.referrer ? new URL(document.referrer) : null;
        const current = new URL(window.location.href);
        if (referrer && referrer.origin === current.origin && referrer.href !== current.href && window.history.length > 1) {
            event.preventDefault();
            window.history.back();
        }
    } catch (_) {
        // Keep the server-rendered fallback when referrer parsing is unavailable.
    }
});


