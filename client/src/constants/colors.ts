/**
 * ReXcan Brand Colors
 * 
 * Color palette based on the ReXcan logo design
 */

export const colors = {
  // Dark Blue End - Bottom left of logo and letters "ReXcan"
  darkBlue: {
    primary: '#002D62',
    secondary: '#191970', // Navy/Midnight Blue
  },
  
  // Bright Cyan/Green End - Top right of logo and letter "X"
  brightCyan: {
    primary: '#00FFD8',
    secondary: '#39FF14', // Bright Teal/Neon Green
  },
  
  // White - Background, letter gaps, and highlights
  white: '#FFFFFF',
  
  // Light Grey - Shadowing and 3D effect on the circle
  lightGrey: {
    primary: '#D3D3D3',
    secondary: '#EAEAEA', // Light Gray/Off-White
  },
} as const;

/**
 * CSS gradient string for the main logo gradient
 * Transitions between dark blue and bright cyan/green
 */
export const logoGradient = `linear-gradient(135deg, ${colors.darkBlue.primary} 0%, ${colors.darkBlue.secondary} 50%, ${colors.brightCyan.primary} 100%)`;

/**
 * CSS gradient string for text gradients
 */
export const textGradient = `linear-gradient(135deg, ${colors.darkBlue.secondary} 0%, ${colors.brightCyan.primary} 100%)`;

