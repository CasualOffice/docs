import * as React from 'react';

/**
 * UnsupportedFeatureWarning — from @casualoffice/docs@1.1.7.
 */
export interface UnsupportedFeatureWarningProps {
  feature: string;
  description?: string;
  className?: string;
}

export declare const UnsupportedFeatureWarning: React.ComponentType<UnsupportedFeatureWarningProps>;
