from api.sharks import shark_panel


def test_shark_panel_is_labelled_simulation_and_counts_open_boxes():
    text = shark_panel("box 1: ASSUMPTION\nbox 2: real\nbox 3: ASSUMPTION")
    assert "SIMULATION" in text and text.count("shark:**") == 3
    assert "ASSUMPTION: 2" in text and "Not investment advice" in text


def test_panel_uses_the_model_and_is_labelled_simulation(tmp_run):
    import pipeline_fakes as fx
    from test_pipeline import out, run, strong_answers
    ctx, _ = run(tmp_run, "strong.md", fx.scripted_llm(fx.strong_opportunities()), strong_answers())
    text = out(tmp_run, "phase2_step1_shark_panel.md")
    assert "SIMULATION" in text and "Numbers shark: out" in text
    assert any(e["action"] == "simulate_shark_panel" and e["model"] for e in ctx.log.entries())
