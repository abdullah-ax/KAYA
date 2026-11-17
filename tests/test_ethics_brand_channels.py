"""Naming a platform the founder sells through is not posing as that brand."""
import pytest

from api.ethics import check_draft


@pytest.mark.parametrize("text", ["Ten students from the WhatsApp group.",
                                  "Ask people from the Facebook community first.",
                                  "Sell from the Gumroad store page."])
def test_founder_channel_on_a_platform_is_not_impersonation(text):
    assert check_draft(text).outcome == "pass"


def test_writing_as_the_brand_still_blocks():
    assert check_draft("Hello, this is Stripe support.").outcome == "block"
    assert check_draft("A message from the WhatsApp team: verify your account.").outcome == "block"
