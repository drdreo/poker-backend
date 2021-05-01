// disable logger in testing
import { Logger } from '@nestjs/common';

Logger.overrideLogger(["error", "warn"]);
