from decimal import ROUND_HALF_UP, Decimal


def calculate_loss(
    av: Decimal | int | str, ef: Decimal | int | str, aro: Decimal | int | str
) -> dict:
    asset_value = Decimal(str(av))
    exposure_factor = Decimal(str(ef))
    annual_rate = Decimal(str(aro))
    if asset_value < 0:
        raise ValueError("Вартість активу не може бути від’ємною.")
    if not Decimal("0") <= exposure_factor <= Decimal("1"):
        raise ValueError("Частка втрати має бути в діапазоні 0–1.")
    if annual_rate < 0:
        raise ValueError("Частота інциденту не може бути від’ємною.")
    sle = (asset_value * exposure_factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    ale = (sle * annual_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return {"av": asset_value, "ef": exposure_factor, "aro": annual_rate, "sle": sle, "ale": ale}
