
/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./src/renderer/**/*.{html,js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                mono: ['Fira Code', 'monospace'],
            },
            colors: {
                success: {
                    50: '#f0fdf4',
                    100: '#dcfce7',
                    500: '#22c55e',
                    700: '#15803d',
                },
                danger: {
                    50: '#fef2f2',
                    100: '#fee2e2',
                    500: '#ef4444',
                    700: '#b91c1c',
                }
            }
        },
    },
    plugins: [],
}
