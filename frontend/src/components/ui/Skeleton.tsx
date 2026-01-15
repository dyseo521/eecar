import { CSSProperties } from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: CSSProperties;
  variant?: 'text' | 'circular' | 'rectangular';
}

/**
 * Skeleton loading component for placeholder content
 * Accessible with aria-hidden and reduced motion support
 */
export function Skeleton({
  width = '100%',
  height = '1rem',
  borderRadius,
  className = '',
  style,
  variant = 'rectangular',
}: SkeletonProps) {
  const getVariantStyles = (): CSSProperties => {
    switch (variant) {
      case 'text':
        return {
          borderRadius: '4px',
          height: '1em',
        };
      case 'circular':
        return {
          borderRadius: '50%',
        };
      case 'rectangular':
      default:
        return {
          borderRadius: borderRadius || '8px',
        };
    }
  };

  const baseStyles: CSSProperties = {
    background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
    backgroundSize: '200% 100%',
    animation: 'skeleton-shimmer 1.5s ease-in-out infinite',
    width,
    height,
    ...getVariantStyles(),
    ...style,
  };

  return (
    <>
      <div
        className={`skeleton ${className}`}
        style={baseStyles}
        aria-hidden="true"
      />
      <style>{`
        @keyframes skeleton-shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .skeleton {
            animation: none;
            background: #e5e7eb;
          }
        }
      `}</style>
    </>
  );
}

/**
 * Pre-configured skeleton for part cards
 */
export function PartCardSkeleton() {
  return (
    <div
      style={{
        background: 'white',
        borderRadius: '16px',
        padding: '0',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
      }}
      aria-label="부품 정보 로딩 중"
    >
      <Skeleton height="200px" borderRadius="0" />
      <div style={{ padding: '1rem' }}>
        <Skeleton height="1.25rem" width="70%" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="1rem" width="50%" style={{ marginBottom: '1rem' }} />
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <Skeleton height="1.5rem" width="60px" borderRadius="12px" />
          <Skeleton height="1.5rem" width="80px" borderRadius="12px" />
        </div>
        <Skeleton height="1.25rem" width="40%" />
      </div>
    </div>
  );
}

export default Skeleton;
