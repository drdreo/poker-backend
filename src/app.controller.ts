import { Controller, Res, Get } from '@nestjs/common';

@Controller()
export class AppController {
    @Get()
    redirect(@Res() res) {
        return res.redirect('/health');
    }
}
