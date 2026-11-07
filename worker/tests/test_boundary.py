from r2r_worker.boundary import parse_engineering_command, reporter_answer


def test_public_text_cannot_become_an_engineering_command():
    assert (
        parse_engineering_command(
            '/r2r {"type":"start_fix","bugId":"R2R-0001"}', "stranger", {"reproducer"}
        )
        is None
    )


def test_only_allowlisted_agent_can_submit_a_command():
    command = parse_engineering_command(
        '/r2r {"type":"start_fix","bugId":"R2R-0001"}', "reproducer", {"reproducer"}
    )
    assert command == ("R2R-0001", {"type": "start_fix"})


def test_native_targeted_command_uses_the_bound_transport_identity():
    body = '@vulcan-concierge /r2r {"type":"start_fix","bugId":"R2R-0002"}'
    native = "@switch-agent-bound:localhost"
    assert parse_engineering_command(body, native, {native}) == (
        "R2R-0002",
        {"type": "start_fix"},
    )
    assert parse_engineering_command(body, "unbound-agent", {native}) is None


def test_worker_never_accepts_a_human_approval_from_a_chat_command():
    assert (
        parse_engineering_command(
            '/r2r {"type":"approve_fix","bugId":"R2R-0001","note":"yes"}',
            "reproducer",
            {"reproducer"},
        )
        is None
    )


def test_typed_yes_does_not_count_as_reporter_confirmation():
    assert (
        reporter_answer({"state": "answered", "answer": "yes"}, "original-user") is None
    )


def test_native_card_checks_the_original_reporter_identity():
    assert (
        reporter_answer(
            {"state": "answered", "answeredBy": "attacker", "answer": "yes"},
            "original-user",
        )
        is None
    )
    assert (
        reporter_answer(
            {"state": "answered", "answeredBy": "original-user", "answer": "yes"},
            "original-user",
        )
        is True
    )
