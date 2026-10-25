const form = document.getElementById("login-form");
const email = document.getElementById("email");
const password = document.getElementById("password");
const emailError = document.getElementById("email-error");
const passwordError = document.getElementById("password-error");
const formAlert = document.getElementById("form-alert");
const note = document.getElementById("auth-note");
const submit = document.getElementById("submit");
const toggle = document.getElementById("toggle-password");

function setFieldError(input, node, message) {
  node.hidden = !message;
  node.textContent = message || "";
  input.setAttribute("aria-invalid", message ? "true" : "false");
}

function validate() {
  const emailMessage = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())
    ? ""
    : "Enter a valid email address.";
  const passwordMessage = password.value.length >= 8
    ? ""
    : "Enter a password of at least 8 characters.";
  setFieldError(email, emailError, emailMessage);
  setFieldError(password, passwordError, passwordMessage);
  return !emailMessage && !passwordMessage;
}

toggle.addEventListener("click", () => {
  const showing = password.type === "text";
  password.type = showing ? "password" : "text";
  toggle.textContent = showing ? "Show password" : "Hide password";
  toggle.setAttribute("aria-pressed", showing ? "false" : "true");
});

fetch("/api/auth/status")
  .then((response) => response.json())
  .then((status) => {
    note.textContent = status.message;
  })
  .catch(() => {
    note.textContent = "Sign-in status could not be checked. The demo is still available.";
  });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formAlert.hidden = true;
  formAlert.textContent = "";
  if (!validate()) return;
  submit.disabled = true;
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.value.trim(), password: password.value }),
    });
    const data = await response.json();
    if (data.errors?.email) setFieldError(email, emailError, data.errors.email);
    if (data.errors?.password) setFieldError(password, passwordError, data.errors.password);
    if (!data.ok) {
      formAlert.hidden = false;
      formAlert.textContent = data.message || "Sign-in is not available.";
    }
  } catch {
    formAlert.hidden = false;
    formAlert.textContent = "Sign-in could not be completed.";
  } finally {
    password.value = "";
    submit.disabled = false;
  }
});
