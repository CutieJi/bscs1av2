const slides = document.querySelectorAll(".slide");
const dots = document.querySelectorAll(".slide-dots .dot");

if (slides.length && dots.length) {
    let current = 0;

    function showSlide(index) {
        slides.forEach((slide, i) => {
            slide.classList.toggle("active", i === index);
        });

        dots.forEach((dot, i) => {
            dot.classList.toggle("active", i === index);
        });
    }

    setInterval(() => {
        current = (current + 1) % slides.length;
        showSlide(current);
    }, 2900);
}