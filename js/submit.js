(function () {
  const MAX_PHOTOS = 5;
  const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

  const form = document.getElementById("entry-form");
  const messageEl = document.getElementById("form-message");
  const photosInput = document.getElementById("photos");

  function showMessage(text, type) {
    messageEl.textContent = text;
    messageEl.className = `form-message ${type}`;
  }

  function clearMessage() {
    messageEl.textContent = "";
    messageEl.className = "form-message";
  }

  function validatePhotos(files) {
    if (files.length > MAX_PHOTOS) {
      return `Please select at most ${MAX_PHOTOS} photos.`;
    }
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return `"${file.name}" is not a supported image type (JPEG, PNG, or WebP only).`;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        return `"${file.name}" is larger than 5MB.`;
      }
    }
    return null;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    const files = Array.from(photosInput.files || []);
    const photoError = validatePhotos(files);
    if (photoError) {
      showMessage(photoError, "error");
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      const formData = new FormData(form);
      const response = await fetch("/api/entries", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        showMessage(errorBody.error || "Something went wrong submitting your entry.", "error");
        submitButton.disabled = false;
        return;
      }

      window.location.href = "index.html";
    } catch (err) {
      showMessage("Could not reach the server. Please try again.", "error");
      submitButton.disabled = false;
    }
  });
})();
