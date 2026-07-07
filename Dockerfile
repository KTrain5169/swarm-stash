FROM nixos/nix:2.34.8

WORKDIR /app

ENV NIX_CONFIG="experimental-features = nix-command flakes"

COPY . .

RUN nix build

CMD ["nix", "run"]
