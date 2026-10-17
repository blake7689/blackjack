const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Returns the error for one profile field, or "" when it is valid. //
export function validateField(name, value) {
  switch (name) {
    case "userName": return !value.trim() ? "Username is required." : value.length < 3 ? "Username must be at least 3 characters." : "";
    case "email": return !value.trim() ? "Email is required." : !EMAIL.test(value) ? "Invalid email format." : "";
    case "password": return value && value.length < 6 ? "Password must be at least 6 characters." : "";
    default: return !value.trim() ? `${name === "firstName" ? "First" : "Last"} name is required.` : "";
  }
}
