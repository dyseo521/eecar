import { ButtonHTMLAttributes, forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, #0055f4, #0080ff)',
    border: 'none',
    color: 'white',
  },
  secondary: {
    background: 'white',
    border: '1px solid #d1d5db',
    color: '#374151',
  },
  ghost: {
    background: 'transparent',
    border: 'none',
    color: '#6b7280',
  },
  danger: {
    background: '#ef4444',
    border: 'none',
    color: 'white',
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: {
    padding: '0.5rem 0.75rem',
    fontSize: '0.8125rem',
  },
  md: {
    padding: '0.875rem 1rem',
    fontSize: '0.9375rem',
  },
  lg: {
    padding: '1rem 1.5rem',
    fontSize: '1rem',
  },
};

/**
 * Accessible Button component with multiple variants
 * Supports keyboard navigation and screen readers
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    variant = 'primary',
    size = 'md',
    isLoading = false,
    fullWidth = false,
    disabled,
    children,
    style,
    ...props
  }, ref) => {
    const baseStyle: React.CSSProperties = {
      borderRadius: '8px',
      fontWeight: 600,
      cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
      transition: 'all 0.2s',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
      opacity: disabled || isLoading ? 0.6 : 1,
      width: fullWidth ? '100%' : 'auto',
      fontFamily: 'inherit',
      ...variantStyles[variant],
      ...sizeStyles[size],
      ...style,
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        style={baseStyle}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading && (
          <span
            className="button-spinner"
            aria-hidden="true"
            style={{
              width: '1em',
              height: '1em',
              border: '2px solid currentColor',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
