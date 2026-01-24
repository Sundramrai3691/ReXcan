/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Poppins', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Oxygen',
                    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 'sans-serif'],
            },
            colors: {
                'rexcan-dark-blue-primary': '#002D62',
                'rexcan-dark-blue-secondary': '#191970',
                'rexcan-bright-cyan-primary': '#00FFD8',
                'rexcan-bright-cyan-secondary': '#39FF14',
                'rexcan-white': '#FFFFFF',
                'rexcan-light-grey-primary': '#D3D3D3',
                'rexcan-light-grey-secondary': '#EAEAEA',
            },
            backgroundImage: {
                'logo-gradient': 'linear-gradient(135deg, #002D62 0%, #191970 50%, #00FFD8 100%)',
                'text-gradient': 'linear-gradient(135deg, #191970 0%, #00FFD8 100%)',
            },
            animation: {
                'spin-slow': 'spin 20s linear infinite',
            },
        },
    },
    plugins: [],
}
