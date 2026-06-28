/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Text Extension — inline text node
 */

import { createNodeExtension } from '../create';

export const TextExtension = createNodeExtension({
  name: 'text',
  schemaNodeName: 'text',
  nodeSpec: {
    group: 'inline',
  },
});
