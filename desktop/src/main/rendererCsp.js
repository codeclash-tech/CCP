export function allowRazorpayCheckoutInDesktopRenderer(html) {
  return html
    .replace("script-src 'self';", "script-src 'self' https://checkout.razorpay.com;")
    .replace("frame-src 'none';", "frame-src https://api.razorpay.com https://checkout.razorpay.com;")
    .replace("form-action 'self'", "form-action 'self' https://api.razorpay.com");
}
