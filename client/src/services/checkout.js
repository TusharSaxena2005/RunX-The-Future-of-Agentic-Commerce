let loading;
export function loadRazorpayCheckout() {
    if (window.Razorpay) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        let timer;
        const fail = () => {
            clearTimeout(timer);
            script.remove();
            loading = undefined;
            reject(new Error('Razorpay Checkout could not load. Check your connection and retry; no payment was recorded.'));
        };
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        script.onload = () => {
            clearTimeout(timer);
            if (!window.Razorpay) return fail();
            resolve();
        };
        script.onerror = fail;
        timer = setTimeout(fail, 15000);
        document.body.appendChild(script);
    });
    return loading;
}
