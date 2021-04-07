
<a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo_text.svg" width="320" alt="Nest Logo" /></a>

[![Build Status](https://travis-ci.com/drdreo/poker-backend.svg?branch=master)](https://travis-ci.com/drdreo/poker-backend)


Live app at netlify: https://pokern.netlify.app

# Poker-Backend

## Running the server

```bash
# development
npm run start

# watch mode
npm run start:dev

# production mode
npm run start:prod

# production build
npm run build
```

## Test

Inside server: 
```bash
# unit tests
npm run test
```

## Submodules
The [client](https://github.com/drdreo/poker-client) and [backend](https://github.com/drdreo/poker-backend) are both submodules of [poker](https://github.com/drdreo/poker).

### Updating Submodules
In order to update the shared dependency correctly, execute:
```bash
git submodule update --remote --merge
```

```bash
git submodule update --recursive
```


# License TL;DR
- The source code must be made public whenever a distribution of the software is made.
- Modifications of the software must be released under the same license.
- Changes made to the source code must be documented.
- If patented material was used in the creation of the software, it grants the right for users to use it. If the user sues anyone over the use of the patented material, they lose the right to use the software. 
