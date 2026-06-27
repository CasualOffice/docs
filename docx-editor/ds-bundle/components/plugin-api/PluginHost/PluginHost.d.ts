import * as React from 'react';

/**
 * PluginHost — from @casualoffice/docs@1.1.7.
 */
export interface PluginHostProps {
  /** Plugins to enable */
  plugins: EditorPlugin<any>[];
  /** The editor component (passed as child) */
  children: React$1.ReactElement<unknown, string | React$1.JSXElementConstructor<any>>;
  /** Class name for the host container */
  className?: string;
}

export declare const PluginHost: React.ComponentType<PluginHostProps>;
