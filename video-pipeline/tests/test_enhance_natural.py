from pipeline.enhance import chain, level_from_header


def test_natural_only_changes_the_volume():
    assert level_from_header("natural") == "natural"
    c = chain("natural")
    assert "afftdn" not in c and "arnndn" not in c and "acompressor" not in c and "equalizer" not in c
    assert "loudnorm=I=-14" in c and "alimiter" in c
    assert chain("natural").rsplit(",loudnorm", 1)[0] == "anull"
